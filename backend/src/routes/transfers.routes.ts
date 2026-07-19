import { Router } from "express";
import { z } from "zod";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { enqueue, QUEUES } from "../queue/index.js";
import { serverForTenant } from "../services/server.service.js";

const transferSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  direction: z.enum(["upload", "download", "sync"]),
  sourcePath: z.string().min(1).max(2048),
  destinationPath: z.string().min(1).max(2048),
  content: z.string().optional(),
  encoding: z.enum(["utf8", "base64"]).default("base64"),
  executeNow: z.boolean().default(true),
});

export const transfersRouter = Router();

transfersRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const status = typeof request.query.status === "string" ? request.query.status : "";
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT t.id, t.server_id AS "serverId", s.name AS "serverName", t.name, t.direction,
                t.source_path AS "sourcePath", t.destination_path AS "destinationPath", t.status,
                t.progress, t.bytes_total AS "bytesTotal", t.bytes_transferred AS "bytesTransferred",
                t.error_message AS "errorMessage", t.created_at AS "createdAt", t.completed_at AS "completedAt"
           FROM transfers t LEFT JOIN server_connections s ON s.id = t.server_id
          WHERE t.organization_id = $1 AND ($2 = '' OR t.status = $2)
          ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
        [request.tenant!.organizationId, status, limit, offset],
      ),
      pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM transfers WHERE organization_id = $1 AND ($2 = '' OR status = $2)", [request.tenant!.organizationId, status]),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);

transfersRouter.post(
  "/",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = transferSchema.parse(request.body);
    const server = await serverForTenant(request.tenant!.organizationId, input.serverId);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO transfers(organization_id, server_id, name, direction, source_path, destination_path, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [request.tenant!.organizationId, server.id, input.name, input.direction, normalizeRemotePath(input.sourcePath), normalizeRemotePath(input.destinationPath), request.auth!.userId],
    );
    const id = result.rows[0]!.id;

    // Handed to the queue rather than executed inline. A transfer against a
    // slow or unreachable server used to hold the HTTP connection open until
    // it finished or timed out, and a failure left no way to retry.
    if (input.executeNow) {
      await enqueue(QUEUES.transfer, {
        transferId: id,
        organizationId: request.tenant!.organizationId,
        serverId: server.id,
        userId: request.auth!.userId,
        direction: input.direction,
        sourcePath: normalizeRemotePath(input.sourcePath),
        destinationPath: normalizeRemotePath(input.destinationPath),
        ...(input.content === undefined
          ? {}
          : { content: Buffer.from(input.content, input.encoding).toString("base64") }),
      });
    }
    const transfer = await pool.query(
      `SELECT id, server_id AS "serverId", name, direction, source_path AS "sourcePath",
              destination_path AS "destinationPath", status, progress, bytes_total AS "bytesTotal",
              bytes_transferred AS "bytesTransferred", created_at AS "createdAt", completed_at AS "completedAt"
         FROM transfers WHERE id = $1 AND organization_id = $2`,
      [id, request.tenant!.organizationId],
    );
    response.status(201).json({ data: transfer.rows[0] });
  }),
);

transfersRouter.post(
  "/:id/cancel",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `UPDATE transfers SET status = 'cancelled', completed_at = now()
        WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'running') RETURNING id, status`,
      [request.params.id, request.tenant!.organizationId],
    );
    if (!result.rows[0]) throw notFound("Cancellable transfer");
    response.json({ data: result.rows[0] });
  }),
);
