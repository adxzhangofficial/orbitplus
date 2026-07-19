import { Router } from "express";
import { z } from "zod";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { conflict, notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { enqueue, QUEUES } from "../queue/index.js";
import { serverForTenant } from "../services/server.service.js";

/**
 * Snapshots of a remote tree.
 *
 * Both operations run on the queue rather than inside the request. A backup of
 * a real directory tree takes minutes: held inline it exceeds any reverse
 * proxy's timeout, and the customer sees a failed request while the work
 * carries on orphaned, leaving a row stuck in 'running' with nothing to
 * finish it.
 *
 * The response is the queued row, so the caller has an id to poll from the
 * moment it returns.
 */

export const backupsRouter = Router();

/** Written once and prefixed per query, so the two shapes cannot drift. */
function backupColumns(prefix: string): string {
  return `${prefix}id, ${prefix}server_id AS "serverId", ${prefix}name,
    ${prefix}root_path AS "path", ${prefix}type, ${prefix}status,
    ${prefix}size_bytes AS "sizeBytes", ${prefix}file_count AS "fileCount",
    ${prefix}retention_until AS "retentionUntil", ${prefix}error_message AS "errorMessage",
    ${prefix}created_at AS "createdAt", ${prefix}started_at AS "startedAt",
    ${prefix}completed_at AS "completedAt", ${prefix}last_restored_at AS "lastRestoredAt"`;
}

const BACKUP_COLUMNS = backupColumns("b.");

backupsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT ${BACKUP_COLUMNS}, s.name AS "serverName"
           FROM backups b LEFT JOIN server_connections s ON s.id = b.server_id
          WHERE b.organization_id = $1 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
        [request.tenant!.organizationId, limit, offset],
      ),
      pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM backups WHERE organization_id = $1", [request.tenant!.organizationId]),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);

backupsRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT ${BACKUP_COLUMNS}, s.name AS "serverName"
         FROM backups b LEFT JOIN server_connections s ON s.id = b.server_id
        WHERE b.id = $1 AND b.organization_id = $2`,
      [request.params.id, request.tenant!.organizationId],
    );
    if (!result.rows[0]) throw notFound("Backup");
    response.json({ data: result.rows[0] });
  }),
);

backupsRouter.post(
  "/",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({
      serverId: z.string().uuid(),
      name: z.string().trim().min(2).max(120),
      path: z.string().max(2048).default("/"),
      retentionDays: z.number().int().min(1).max(3650).default(30),
    }).parse(request.body);

    const server = await serverForTenant(request.tenant!.organizationId, input.serverId);
    const rootPath = normalizeRemotePath(input.path);

    const created = await pool.query(
      `INSERT INTO backups(organization_id, server_id, name, root_path, type, status, retention_until, created_by)
       VALUES($1,$2,$3,$4,$5,'queued',now() + ($6 || ' days')::interval,$7)
       RETURNING ${backupColumns("")}`,
      [request.tenant!.organizationId, server.id, input.name, rootPath,
       rootPath === "/" ? "full" : "partial", input.retentionDays, request.auth!.userId],
    );
    const backup = created.rows[0]!;

    await enqueue(QUEUES.backup, {
      backupId: backup.id,
      organizationId: request.tenant!.organizationId,
      serverId: server.id,
      userId: request.auth!.userId,
      rootPath,
    });

    // 202: accepted and queued, not finished. The row carries the status.
    response.status(202).json({ data: backup });
  }),
);

backupsRouter.post(
  "/:id/restore",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    // Claimed in the same statement that checks it: two people pressing restore
    // at once must not both start writing the same files to the same server.
    const claimed = await pool.query<{ id: string; server_id: string; storage_key: string }>(
      `UPDATE backups SET status = 'restoring'
        WHERE id = $1 AND organization_id = $2 AND status = 'completed' AND storage_key IS NOT NULL
        RETURNING id, server_id, storage_key`,
      [request.params.id, request.tenant!.organizationId],
    );
    const row = claimed.rows[0];
    if (!row) {
      const exists = await pool.query<{ status: string }>(
        "SELECT status FROM backups WHERE id = $1 AND organization_id = $2",
        [request.params.id, request.tenant!.organizationId],
      );
      if (!exists.rowCount) throw notFound("Backup");
      throw conflict(`A backup in the ${exists.rows[0]!.status} state cannot be restored`);
    }

    const server = await serverForTenant(request.tenant!.organizationId, row.server_id);
    await enqueue(QUEUES.backupRestore, {
      backupId: row.id,
      organizationId: request.tenant!.organizationId,
      serverId: server.id,
      userId: request.auth!.userId,
      rootPath: "/",
      storageKey: row.storage_key,
    });

    response.status(202).json({ data: { backupId: row.id, status: "restoring" } });
  }),
);
