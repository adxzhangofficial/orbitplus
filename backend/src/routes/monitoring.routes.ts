import { Router } from "express";
import { z } from "zod";
import { withAdapter, withDirectAdapter } from "../adapters/index.js";
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
        // Each metric takes its own freshest non-null value from the last
        // fifteen minutes. Without that bound a reading kept being served long
        // after anything stopped producing it, so a host whose agent died a
        // week ago still showed last week CPU as though it were now. Past the
        // window the value is null and the interface says so.
        //
        // Per-metric rather than
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
               (SELECT cpu_percent FROM monitors WHERE server_id = s.id AND cpu_percent IS NOT NULL AND sampled_at > now() - interval '15 minutes' ORDER BY sampled_at DESC LIMIT 1) AS "cpuPercent",
               (SELECT memory_percent FROM monitors WHERE server_id = s.id AND memory_percent IS NOT NULL AND sampled_at > now() - interval '15 minutes' ORDER BY sampled_at DESC LIMIT 1) AS "memoryPercent",
               (SELECT disk_percent FROM monitors WHERE server_id = s.id AND disk_percent IS NOT NULL AND sampled_at > now() - interval '15 minutes' ORDER BY sampled_at DESC LIMIT 1) AS "diskPercent",
               (SELECT latency_ms FROM monitors WHERE server_id = s.id AND latency_ms IS NOT NULL AND sampled_at > now() - interval '15 minutes' ORDER BY sampled_at DESC LIMIT 1) AS "latencyMs",
               -- When the resource numbers were actually measured, which is
               -- older than sampledAt whenever only probes have run since.
               (SELECT sampled_at FROM monitors WHERE server_id = s.id AND cpu_percent IS NOT NULL AND sampled_at > now() - interval '15 minutes' ORDER BY sampled_at DESC LIMIT 1) AS "metricsSampledAt",
               (SELECT source FROM monitors WHERE server_id = s.id AND cpu_percent IS NOT NULL AND sampled_at > now() - interval '15 minutes' ORDER BY sampled_at DESC LIMIT 1) AS "metricsSource"
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
      health = await withDirectAdapter(server, (adapter) => adapter.health());
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

/**
 * Resource history for one server.
 *
 * The sweep already stores a sample per server per run and keeps seven days, so
 * this is a read of data that exists rather than anything new being collected.
 * The detail page was drawing its chart from an empty array with a hardcoded
 * baseline, which meant the graph showed either nothing or a shape unrelated to
 * the server.
 *
 * Samples are bucketed rather than returned raw: a day at one sample a minute
 * is 1,440 points for a chart a few hundred pixels wide, and sending them all
 * would make the response large to draw something no one can distinguish.
 */
monitoringRouter.get(
  "/:serverId/history",
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "serverId"));
    const { hours, buckets } = z.object({
      hours: z.coerce.number().int().min(1).max(168).default(24),
      buckets: z.coerce.number().int().min(12).max(240).default(48),
    }).parse(request.query);

    const result = await pool.query<{
      bucket: Date;
      cpu: string | null;
      memory: string | null;
      disk: string | null;
      latency: string | null;
      samples: number;
    }>(
      // width_bucket over the window gives evenly spaced slots whatever the
      // range, so the chart's x-axis is time rather than sample index — a gap
      // where the sweep did not run stays visible as a gap.
      `WITH bounds AS (
         SELECT now() - ($2 || ' hours')::interval AS start_at, now() AS end_at
       )
       SELECT
         (SELECT start_at FROM bounds)
           + (($2 || ' hours')::interval * (bucket_index - 1) / $3) AS bucket,
         round(avg(cpu_percent), 1) AS cpu,
         round(avg(memory_percent), 1) AS memory,
         round(avg(disk_percent), 1) AS disk,
         round(avg(latency_ms)) AS latency,
         count(*)::integer AS samples
       FROM (
         SELECT m.*,
                width_bucket(
                  extract(epoch FROM m.sampled_at),
                  extract(epoch FROM (SELECT start_at FROM bounds)),
                  extract(epoch FROM (SELECT end_at FROM bounds)),
                  $3
                ) AS bucket_index
           FROM monitors m
          WHERE m.server_id = $1
            AND m.sampled_at >= (SELECT start_at FROM bounds)
       ) grouped
       WHERE bucket_index BETWEEN 1 AND $3
       GROUP BY bucket_index
       ORDER BY bucket_index`,
      [server.id, hours, buckets],
    );

    response.json({
      data: result.rows.map((row) => ({
        at: row.bucket.toISOString(),
        // Null where nothing was measured in that slot, so the chart draws a
        // break instead of joining across an outage as though it were flat.
        cpu: row.cpu === null ? null : Number(row.cpu),
        memory: row.memory === null ? null : Number(row.memory),
        disk: row.disk === null ? null : Number(row.disk),
        latencyMs: row.latency === null ? null : Number(row.latency),
        samples: row.samples,
      })),
      meta: { serverId: server.id, hours, buckets },
    });
  }),
);
