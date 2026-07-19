import { Router } from "express";
import { z } from "zod";
import { withAdapter } from "../adapters/index.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { routeParam } from "../lib/route-param.js";
import { serverForTenant } from "../services/server.service.js";

export const monitoringRouter = Router();

monitoringRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const [servers, alerts] = await Promise.all([
      pool.query(
        `SELECT s.id AS "serverId", s.name AS "serverName", s.status AS "connectionStatus",
                m.status, m.cpu_percent AS "cpuPercent", m.memory_percent AS "memoryPercent",
                m.disk_percent AS "diskPercent", m.latency_ms AS "latencyMs", m.services,
                m.sampled_at AS "sampledAt"
           FROM server_connections s
           LEFT JOIN LATERAL (
             SELECT * FROM monitors WHERE server_id = s.id ORDER BY sampled_at DESC LIMIT 1
           ) m ON true WHERE s.organization_id = $1 ORDER BY s.name`,
        [request.tenant!.organizationId],
      ),
      pool.query(
        `SELECT a.id, a.server_id AS "serverId", s.name AS "serverName", a.severity, a.title,
                a.message, a.status, a.created_at AS "createdAt", a.resolved_at AS "resolvedAt"
           FROM alerts a LEFT JOIN server_connections s ON s.id = a.server_id
          WHERE a.organization_id = $1 ORDER BY CASE a.status WHEN 'open' THEN 1 WHEN 'acknowledged' THEN 2 ELSE 3 END, a.created_at DESC LIMIT 100`,
        [request.tenant!.organizationId],
      ),
    ]);
    response.json({ data: { servers: servers.rows, alerts: alerts.rows } });
  }),
);

monitoringRouter.post(
  "/probe/:serverId",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    let health: { ok: boolean; latencyMs: number; message: string };
    try {
      health = await withAdapter(server, (adapter) => adapter.health());
    } catch (error) {
      health = { ok: false, latencyMs: 0, message: error instanceof Error ? error.message : "Probe failed" };
    }
    const result = await pool.query(
      `INSERT INTO monitors(organization_id, server_id, status, latency_ms, services)
       VALUES($1,$2,$3,$4,$5::jsonb)
       RETURNING id, server_id AS "serverId", status, latency_ms AS "latencyMs", services, sampled_at AS "sampledAt"`,
      [request.tenant!.organizationId, server.id, health.ok ? "healthy" : "critical", health.latencyMs, JSON.stringify([{ name: "sftp", status: health.ok ? "up" : "down", message: health.message }])],
    );
    await pool.query("UPDATE server_connections SET status = $3, last_checked_at = now(), last_latency_ms = $4 WHERE id = $1 AND organization_id = $2", [server.id, server.organization_id, health.ok ? "online" : "offline", health.latencyMs]);
    response.status(201).json({ data: result.rows[0] });
  }),
);

monitoringRouter.patch(
  "/alerts/:id",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ status: z.enum(["acknowledged", "resolved"]) }).parse(request.body);
    const result = await pool.query(
      `UPDATE alerts SET status = $3, resolved_at = CASE WHEN $3 = 'resolved' THEN now() ELSE resolved_at END
        WHERE id = $1 AND organization_id = $2 RETURNING id, status, resolved_at AS "resolvedAt"`,
      [request.params.id, request.tenant!.organizationId, input.status],
    );
    if (!result.rows[0]) throw notFound("Alert");
    response.json({ data: result.rows[0] });
  }),
);
