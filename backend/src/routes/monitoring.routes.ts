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
        // Each metric takes its own freshest non-null value rather than
        // everything coming from the single latest row. Different sources
        // supply different fields: an SFTP probe can measure latency but
        // cannot read CPU, memory, or disk, so taking the latest row alone
        // meant a probe running after an agent report replaced real numbers
        // with nulls. Nulls stay null; the interface reports "no data" rather
        // than rendering them as zero.
        `SELECT s.id AS "serverId", s.name AS "serverName", s.status AS "connectionStatus",
                m.status, m."cpuPercent", m."memoryPercent", m."diskPercent",
                m."latencyMs", m.services, m."sampledAt", m."metricsSampledAt", m."metricsSource"
           FROM server_connections s
           LEFT JOIN LATERAL (
             SELECT
               (SELECT status FROM monitors WHERE server_id = s.id ORDER BY sampled_at DESC LIMIT 1) AS status,
               (SELECT services FROM monitors WHERE server_id = s.id ORDER BY sampled_at DESC LIMIT 1) AS services,
               (SELECT sampled_at FROM monitors WHERE server_id = s.id ORDER BY sampled_at DESC LIMIT 1) AS "sampledAt",
               (SELECT cpu_percent FROM monitors WHERE server_id = s.id AND cpu_percent IS NOT NULL ORDER BY sampled_at DESC LIMIT 1) AS "cpuPercent",
               (SELECT memory_percent FROM monitors WHERE server_id = s.id AND memory_percent IS NOT NULL ORDER BY sampled_at DESC LIMIT 1) AS "memoryPercent",
               (SELECT disk_percent FROM monitors WHERE server_id = s.id AND disk_percent IS NOT NULL ORDER BY sampled_at DESC LIMIT 1) AS "diskPercent",
               (SELECT latency_ms FROM monitors WHERE server_id = s.id AND latency_ms IS NOT NULL ORDER BY sampled_at DESC LIMIT 1) AS "latencyMs",
               -- When the resource numbers were actually measured, which is
               -- older than sampledAt whenever only probes have run since.
               (SELECT sampled_at FROM monitors WHERE server_id = s.id AND cpu_percent IS NOT NULL ORDER BY sampled_at DESC LIMIT 1) AS "metricsSampledAt",
               (SELECT source FROM monitors WHERE server_id = s.id AND cpu_percent IS NOT NULL ORDER BY sampled_at DESC LIMIT 1) AS "metricsSource"
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
