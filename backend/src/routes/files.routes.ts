import { Router } from "express";
import { z } from "zod";
import { withAdapter } from "../adapters/index.js";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sha256 } from "../lib/crypto.js";
import { notFound } from "../lib/errors.js";
import { explicitQueryBoolean } from "../lib/query-boolean.js";
import { routeParam } from "../lib/route-param.js";
import { requireRole } from "../middleware/auth.js";
import { enforceFileLimit, moveVersionsForTenant, readOptional, readOptionalDeleteSnapshot, saveVersion, versionForTenant, writeVersioned } from "../services/file.service.js";
import { serverForTenant } from "../services/server.service.js";

const pathQuery = z.object({ path: z.string().max(2048).default("/") });
const writeSchema = z.object({
  path: z.string().min(1).max(2048),
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  note: z.string().max(500).optional(),
});

export const filesRouter = Router({ mergeParams: true });

filesRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const query = pathQuery.parse(request.query);
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const entries = await withAdapter(server, (adapter) => adapter.list(normalizeRemotePath(query.path)));
    response.json({ data: entries, meta: { path: normalizeRemotePath(query.path), count: entries.length } });
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
    response.json({ data: { path, size: content.length, checksum: version.checksum, versionId: version.id, versionNumber: version.versionNumber } });
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
    response.status(204).send();
  }),
);
