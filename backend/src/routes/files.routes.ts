import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { withAdapter } from "../adapters/index.js";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sha256 } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { explicitQueryBoolean } from "../lib/query-boolean.js";
import { routeParam } from "../lib/route-param.js";
import { requireRole } from "../middleware/auth.js";
import { enforceFileLimit, moveVersionsForTenant, readOptional, readOptionalDeleteSnapshot, saveVersion, versionForTenant, writeVersioned } from "../services/file.service.js";
import { serverForTenant } from "../services/server.service.js";
import { invalidate, isFresh, listWithPrefetch, readCached } from "../services/directory-cache.js";
import { invalidatePath, listFromIndex, markIndexStatus } from "../services/tree-index.service.js";
import { enqueue, QUEUES } from "../queue/index.js";

const pathQuery = z.object({ path: z.string().max(2048).default("/") });
const writeSchema = z.object({
  path: z.string().min(1).max(2048),
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  note: z.string().max(500).optional(),
});

/**
 * Uploads are buffered in memory rather than spooled to disk. The per-file cap
 * keeps that bounded, and avoiding a temp file means no partially written
 * upload can survive a crash on a shared worker.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 20 },
});

export const filesRouter = Router({ mergeParams: true });

const listQuery = pathQuery.extend({
  /** Directories inside the target to fetch in the same request. */
  prefetch: z.coerce.number().int().min(0).max(1).default(1),
  /** Bypasses the cache for an explicit refresh. */
  fresh: z.coerce.boolean().default(false),
  /**
   * Answers only from cache or the index, never by opening a connection.
   *
   * For incidental panels that show a few filenames alongside other content.
   * Without this, a summary widget on an unrelated page opens an SSH
   * connection and, against an unreachable host, blocks for the full connect
   * timeout on every render.
   */
  indexOnly: z.coerce.boolean().default(false),
});

filesRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = listQuery.parse(request.query);
    const path = normalizeRemotePath(query.path);
    const organizationId = request.tenant!.organizationId;
    const server = await serverForTenant(organizationId, routeParam(request, "serverId"));

    // Served from cache when fresh. Browsing is bounded by network round trips,
    // so the only way a click feels instant is to already hold the answer.
    if (!query.fresh) {
      const cached = readCached(organizationId, server.id, path);
      if (cached && isFresh(cached.ageMs)) {
        response.setHeader("x-orbit-cache", "hit");
        response.json({ data: cached.entries, meta: { path, count: cached.entries.length, cached: true, ageMs: cached.ageMs } });
        return;
      }

      // The indexed tree covers the whole server from one `find`, so it answers
      // directories that were never visited in this session. The in-memory
      // cache above only holds paths already fetched.
      const indexed = await listFromIndex(server.id, path);
      if (indexed) {
        response.setHeader("x-orbit-cache", "index");
        response.json({
          data: indexed.entries,
          meta: { path, count: indexed.entries.length, cached: true, source: "index", indexedAt: indexed.indexedAt },
        });
        return;
      }
    }

    if (query.indexOnly) {
      // Nothing cached and no index yet. An empty listing is the honest answer
      // for a panel that must not hold a connection open.
      response.setHeader("x-orbit-cache", "empty");
      response.json({ data: [], meta: { path, count: 0, cached: false, source: "index", pending: true } });
      return;
    }

    const result = await withAdapter(server, (adapter) =>
      listWithPrefetch(adapter, organizationId, server.id, path, query.prefetch),
    );
    response.setHeader("x-orbit-cache", "miss");
    response.json({
      data: result.entries,
      meta: {
        path,
        count: result.entries.length,
        cached: false,
        // Subdirectory listings fetched alongside this one, so navigating into
        // any of them needs no further request.
        prefetched: result.prefetched,
      },
    });
  }),
);

/** Index state, so the UI can say whether the tree is cached and how old it is. */
filesRouter.get(
  "/index",
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const result = await pool.query(
      `SELECT status, entry_count AS "entryCount", truncated, duration_ms AS "durationMs",
              error_message AS "errorMessage", completed_at AS "completedAt", updated_at AS "updatedAt"
         FROM remote_index_runs WHERE server_id = $1`,
      [server.id],
    );
    response.json({ data: result.rows[0] ?? { status: "pending", entryCount: 0 } });
  }),
);

/**
 * Walks the whole tree in one command and caches the metadata.
 *
 * Queued rather than run inline: a large tree takes seconds, which must not
 * hold an HTTP connection open, and the queue already handles retries.
 */
filesRouter.post(
  "/index",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    if (server.adapter_mode === "demo") {
      throw badRequest("The demo adapter reads local storage directly and needs no index");
    }
    await markIndexStatus(server, "pending");
    const jobId = await enqueue(QUEUES.treeIndex, {
      serverId: server.id,
      organizationId: request.tenant!.organizationId,
    });
    response.status(202).json({ data: { status: "pending", jobId } });
  }),
);

/** Name search across the cached tree, with no remote round trip at all. */
filesRouter.get(
  "/search",
  asyncHandler(async (request, response) => {
    const input = z.object({
      q: z.string().trim().min(1).max(200),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(request.query);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const result = await pool.query(
      `SELECT name, path, type, size_bytes AS "size", mode AS "permissions", modified_at AS "modifiedAt"
         FROM remote_entries
        WHERE server_id = $1 AND lower(name) LIKE '%' || lower($2) || '%'
        ORDER BY type = 'directory' DESC, length(path), lower(name)
        LIMIT $3`,
      [server.id, input.q, input.limit],
    );
    response.json({ data: result.rows, meta: { source: "index" } });
  }),
);

filesRouter.get(
  "/content",
  asyncHandler(async (request, response) => {
    const query = pathQuery.parse(request.query);
    const path = normalizeRemotePath(query.path);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const content = await withAdapter(server, (adapter) => adapter.read(path));
    enforceFileLimit(content);
    const binary = content.includes(0);
    response.json({
      data: {
        path,
        content: content.toString(binary ? "base64" : "utf8"),
        encoding: binary ? "base64" : "utf8",
        size: content.length,
        checksum: sha256(content),
      },
    });
  }),
);

filesRouter.put(
  "/content",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = writeSchema.parse(request.body);
    const path = normalizeRemotePath(input.path);
    const content = Buffer.from(input.content, input.encoding);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const version = await withAdapter(server, (adapter) => writeVersioned({
      adapter,
      organizationId: request.tenant!.organizationId,
      serverId: server.id,
      path,
      content,
      userId: request.auth!.userId,
      expectedChecksum: input.expectedChecksum,
      note: input.note,
    }));
    invalidate(request.tenant!.organizationId, server.id, path);
    await invalidatePath(server.id, path);
    response.json({ data: { path, size: content.length, checksum: version.checksum, versionId: version.id, versionNumber: version.versionNumber } });
  }),
);

/**
 * Streams a file to the browser as an attachment. Unlike /content this has no
 * editor size limit and never base64-expands the payload into JSON, so it is
 * the correct path for binaries and large files.
 */
filesRouter.get(
  "/download",
  asyncHandler(async (request, response) => {
    const query = pathQuery.parse(request.query);
    const path = normalizeRemotePath(query.path);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const content = await withAdapter(server, (adapter) => adapter.read(path));
    const filename = path.split("/").filter(Boolean).at(-1) ?? "download";
    response.setHeader("content-type", "application/octet-stream");
    response.setHeader("content-length", String(content.length));
    // RFC 5987 encoding so non-ASCII names survive the header.
    response.setHeader(
      "content-disposition",
      `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    response.setHeader("x-orbit-checksum", sha256(content));
    response.send(content);
  }),
);

filesRouter.post(
  "/upload",
  requireRole("developer"),
  upload.array("files", 20),
  asyncHandler(async (request, response) => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest("Attach at least one file to upload");
    const directory = normalizeRemotePath(
      typeof request.body?.path === "string" && request.body.path.length > 0 ? request.body.path : "/",
    );
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));

    const results = await withAdapter(server, async (adapter) => {
      const written: Array<{ path: string; size: number; checksum: string; versioned: boolean; versionId?: string }> = [];
      for (const file of files) {
        // multer preserves the client-supplied name; strip any directory
        // component so an upload cannot escape the chosen folder.
        const name = file.originalname.split(/[\\/]/).pop() || "upload";
        const target = normalizeRemotePath(`${directory.replace(/\/$/, "")}/${name}`);
        const checksum = sha256(file.buffer);

        if (file.buffer.length <= env.MAX_VERSIONED_UPLOAD_BYTES) {
          const previous = await readOptional(adapter, target);
          if (previous && previous.length <= env.MAX_VERSIONED_UPLOAD_BYTES) {
            await saveVersion({
              organizationId: request.tenant!.organizationId,
              serverId: server.id,
              path: target,
              content: previous,
              userId: request.auth!.userId,
              operation: "pre-upload",
            });
          }
          await adapter.write(target, file.buffer);
          const version = await saveVersion({
            organizationId: request.tenant!.organizationId,
            serverId: server.id,
            path: target,
            content: file.buffer,
            userId: request.auth!.userId,
            operation: "upload",
          });
          written.push({ path: target, size: file.buffer.length, checksum, versioned: true, versionId: version.id });
        } else {
          // Too large for history; the bytes land on the server and the audit
          // trail records the checksum without storing a copy.
          await adapter.write(target, file.buffer);
          written.push({ path: target, size: file.buffer.length, checksum, versioned: false });
        }
      }
      return written;
    });

    invalidate(request.tenant!.organizationId, server.id, directory);
    await invalidatePath(server.id, directory);
    response.status(201).json({ data: results, meta: { directory, count: results.length } });
  }),
);

filesRouter.get(
  "/versions",
  asyncHandler(async (request, response) => {
    const query = pathQuery.parse(request.query);
    const path = normalizeRemotePath(query.path);
    const serverId = routeParam(request, "serverId");
    await serverForTenant(request.tenant!.organizationId, serverId);
    const result = await pool.query(
      `SELECT fv.id, fv.path, fv.version_number AS "versionNumber", fv.size_bytes AS "sizeBytes",
              fv.checksum, fv.operation, fv.note, fv.created_at AS "createdAt",
              u.name AS "createdBy"
         FROM file_versions fv LEFT JOIN users u ON u.id = fv.created_by
        WHERE fv.organization_id = $1 AND fv.server_id = $2 AND fv.path = $3
        ORDER BY fv.version_number DESC LIMIT 100`,
      [request.tenant!.organizationId, serverId, path],
    );
    response.json({ data: result.rows });
  }),
);

filesRouter.post(
  "/rollback",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ versionId: z.string().uuid(), note: z.string().max(500).optional() }).parse(request.body);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const version = await versionForTenant(request.tenant!.organizationId, server.id, input.versionId);
    const restored = await withAdapter(server, async (adapter) => {
      const current = await readOptional(adapter, version.path);
      if (current) await saveVersion({ organizationId: request.tenant!.organizationId, serverId: server.id, path: version.path, content: current, userId: request.auth!.userId, operation: "pre-rollback", note: input.note });
      await adapter.write(version.path, version.content);
      return saveVersion({ organizationId: request.tenant!.organizationId, serverId: server.id, path: version.path, content: version.content, userId: request.auth!.userId, operation: "rollback", note: input.note ?? `Restored ${version.id}` });
    });
    invalidate(request.tenant!.organizationId, server.id, version.path);
    await invalidatePath(server.id, version.path);
    response.json({ data: { path: version.path, restoredFromVersionId: version.id, checksum: restored.checksum, versionNumber: restored.versionNumber } });
  }),
);

filesRouter.post(
  "/directory",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ path: z.string().min(1).max(2048) }).parse(request.body);
    const path = normalizeRemotePath(input.path);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    await withAdapter(server, (adapter) => adapter.mkdir(path));
    invalidate(request.tenant!.organizationId, server.id, path);
    await invalidatePath(server.id, path);
    response.status(201).json({ data: { path, type: "directory" } });
  }),
);

filesRouter.post(
  "/rename",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ from: z.string().min(1).max(2048), to: z.string().min(1).max(2048) }).parse(request.body);
    const from = normalizeRemotePath(input.from);
    const to = normalizeRemotePath(input.to);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    await withAdapter(server, async (adapter) => {
      await adapter.rename(from, to);
      try {
        await moveVersionsForTenant(request.tenant!.organizationId, server.id, from, to);
      } catch (error) {
        // Best-effort compensation keeps the remote tree and authenticated
        // version metadata aligned if the database transaction fails.
        await adapter.rename(to, from).catch(() => undefined);
        throw error;
      }
    });
    invalidate(request.tenant!.organizationId, server.id, from);
    await invalidatePath(server.id, from);
    invalidate(request.tenant!.organizationId, server.id, to);
    await invalidatePath(server.id, to);
    response.json({ data: { from, to } });
  }),
);

filesRouter.delete(
  "/entry",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ path: z.string().min(1).max(2048), recursive: explicitQueryBoolean.default(false) }).parse(request.query);
    const path = normalizeRemotePath(input.path);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    await withAdapter(server, async (adapter) => {
      const content = await readOptionalDeleteSnapshot(adapter, path);
      if (content) await saveVersion({ organizationId: request.tenant!.organizationId, serverId: server.id, path, content, userId: request.auth!.userId, operation: "delete", note: "Snapshot before deletion" });
      await adapter.delete(path, input.recursive);
    });
    invalidate(request.tenant!.organizationId, server.id, path);
    await invalidatePath(server.id, path);
    response.status(204).send();
  }),
);
