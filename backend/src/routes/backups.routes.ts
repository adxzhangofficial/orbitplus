import { Router } from "express";
import { z } from "zod";
import { withAdapter } from "../adapters/index.js";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { createSnapshot, restoreSnapshot } from "../services/backup.service.js";
import { serverForTenant } from "../services/server.service.js";

export const backupsRouter = Router();

backupsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT b.id, b.server_id AS "serverId", s.name AS "serverName", b.name, b.path, b.status,
                b.size_bytes AS "sizeBytes", b.file_count AS "fileCount", b.retention_until AS "retentionUntil",
                b.created_at AS "createdAt", b.completed_at AS "completedAt"
           FROM backups b LEFT JOIN server_connections s ON s.id = b.server_id
          WHERE b.organization_id = $1 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
        [request.tenant!.organizationId, limit, offset],
      ),
      pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM backups WHERE organization_id = $1", [request.tenant!.organizationId]),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);

backupsRouter.post(
  "/",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ serverId: z.string().uuid(), name: z.string().trim().min(2).max(120), path: z.string().max(2048).default("/"), retentionDays: z.number().int().min(1).max(3650).default(30) }).parse(request.body);
    const server = await serverForTenant(request.tenant!.organizationId, input.serverId);
    const created = await pool.query<{ id: string }>(
      `INSERT INTO backups(organization_id, server_id, name, path, status, retention_until, created_by)
       VALUES($1,$2,$3,$4,'running',now() + ($5 || ' days')::interval,$6) RETURNING id`,
      [request.tenant!.organizationId, server.id, input.name, normalizeRemotePath(input.path), input.retentionDays, request.auth!.userId],
    );
    const backupId = created.rows[0]!.id;
    try {
      const snapshot = await withAdapter(server, (adapter) => createSnapshot(request.tenant!.organizationId, backupId, normalizeRemotePath(input.path), adapter));
      const result = await pool.query(
        `UPDATE backups SET status = 'completed', storage_key = $3, size_bytes = $4, file_count = $5, completed_at = now()
          WHERE id = $1 AND organization_id = $2
          RETURNING id, server_id AS "serverId", name, path, status, size_bytes AS "sizeBytes", file_count AS "fileCount", retention_until AS "retentionUntil", created_at AS "createdAt", completed_at AS "completedAt"`,
        [backupId, request.tenant!.organizationId, snapshot.storageKey, snapshot.sizeBytes, snapshot.fileCount],
      );
      response.status(201).json({ data: result.rows[0] });
    } catch (error) {
      await pool.query("UPDATE backups SET status = 'failed', completed_at = now(), metadata = jsonb_build_object('error', $2::text) WHERE id = $1", [backupId, error instanceof Error ? error.message.slice(0, 1000) : "Backup failed"]);
      throw error;
    }
  }),
);

backupsRouter.post(
  "/:id/restore",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const backup = await pool.query<{ id: string; server_id: string; storage_key: string; status: string }>(
      "SELECT id, server_id, storage_key, status FROM backups WHERE id = $1 AND organization_id = $2",
      [request.params.id, request.tenant!.organizationId],
    );
    const row = backup.rows[0];
    if (!row || !row.storage_key || row.status !== "completed") throw notFound("Restorable backup");
    const server = await serverForTenant(request.tenant!.organizationId, row.server_id);
    await pool.query("UPDATE backups SET status = 'restoring' WHERE id = $1", [row.id]);
    try {
      const result = await withAdapter(server, (adapter) => restoreSnapshot(row.storage_key, adapter));
      await pool.query("UPDATE backups SET status = 'completed', metadata = metadata || jsonb_build_object('lastRestoreAt', now()) WHERE id = $1", [row.id]);
      response.json({ data: { backupId: row.id, ...result } });
    } catch (error) {
      await pool.query("UPDATE backups SET status = 'completed' WHERE id = $1", [row.id]);
      throw error;
    }
  }),
);
