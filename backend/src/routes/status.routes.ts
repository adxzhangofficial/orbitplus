import { Router } from "express";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { poolStats } from "../adapters/index.js";
import { getBoss } from "../queue/index.js";

/**
 * Public status.
 *
 * Unauthenticated by design: a status page is most needed by people who cannot
 * sign in, which is precisely when an authenticated one is useless.
 *
 * Every figure here is measured now. The page this replaces displayed invented
 * uptime percentages and a green banner regardless of what was happening, which
 * is worse than having no status page at all: during an outage it would have
 * shown healthy to the customers checking it because they were down.
 *
 * Nothing tenant-specific is exposed. Counts are platform-wide and no
 * organization, server, or user is identifiable.
 */

interface ComponentStatus {
  name: string;
  status: "operational" | "degraded" | "down";
  detail: string;
  latencyMs?: number;
}

export const statusRouter = Router();

async function checkDatabase(): Promise<ComponentStatus> {
  const started = Date.now();
  try {
    await pool.query("SELECT 1");
    const latencyMs = Date.now() - started;
    return {
      name: "Database",
      // A database answering slowly is not healthy even though it answered.
      status: latencyMs > 1_000 ? "degraded" : "operational",
      detail: latencyMs > 1_000 ? "Responding slowly" : "Accepting queries",
      latencyMs,
    };
  } catch (error) {
    return {
      name: "Database",
      status: "down",
      detail: error instanceof Error ? error.message.slice(0, 120) : "Unavailable",
    };
  }
}

async function checkQueue(): Promise<ComponentStatus> {
  const started = Date.now();
  try {
    const boss = await getBoss();
    const queue = await boss.getQueue("transfer.execute");
    // readyCount rather than queuedCount: the latter includes future-dated
    // jobs, so a scheduled sweep would read as a backlog.
    const waiting = queue?.readyCount ?? 0;
    return {
      name: "Job queue",
      // A deep backlog means work is accepted but not progressing, which a
      // simple reachability check would report as healthy.
      status: waiting > 500 ? "degraded" : "operational",
      detail: waiting > 500 ? `${waiting} jobs waiting` : "Processing normally",
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      name: "Job queue",
      status: "down",
      detail: error instanceof Error ? error.message.slice(0, 120) : "Unavailable",
    };
  }
}

async function checkWorkers(): Promise<ComponentStatus> {
  try {
    // The health sweep runs every minute, so a sample older than five minutes
    // means no worker is consuming the queue even if the queue itself is fine.
    const result = await pool.query<{ latest: Date | null }>(
      "SELECT max(sampled_at) AS latest FROM monitors WHERE source = 'probe'",
    );
    const latest = result.rows[0]?.latest;
    if (!latest) return { name: "Workers", status: "operational", detail: "No servers to probe yet" };

    const ageMs = Date.now() - latest.getTime();
    if (ageMs > 15 * 60_000) return { name: "Workers", status: "down", detail: "No activity in 15 minutes" };
    if (ageMs > 5 * 60_000) return { name: "Workers", status: "degraded", detail: "Last sweep was late" };
    return { name: "Workers", status: "operational", detail: "Sweeping on schedule" };
  } catch {
    return { name: "Workers", status: "down", detail: "Cannot read worker activity" };
  }
}

function checkConnections(): ComponentStatus {
  const stats = poolStats();
  const open = stats.reduce((sum, entry) => sum + entry.open, 0);
  const inUse = stats.reduce((sum, entry) => sum + entry.inUse, 0);
  return {
    name: "SFTP workers",
    status: "operational",
    detail: open === 0 ? "Idle" : `${inUse} of ${open} connections busy`,
  };
}

statusRouter.get(
  "/status",
  asyncHandler(async (_request, response) => {
    const [database, queue, workers] = await Promise.all([checkDatabase(), checkQueue(), checkWorkers()]);
    const components = [database, queue, workers, checkConnections()];

    // The worst component decides the headline. Reporting "operational"
    // because most things work is how a status page loses its meaning.
    const overall = components.some((item) => item.status === "down") ? "down"
      : components.some((item) => item.status === "degraded") ? "degraded"
      : "operational";

    // Derived from real probe samples rather than asserted. Only the last 24
    // hours, because a longer window would need retained history this does not
    // yet keep.
    const uptime = await pool.query<{ total: string; healthy: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'healthy') AS healthy
         FROM monitors
        WHERE source = 'probe' AND sampled_at > now() - interval '24 hours'`,
    ).catch(() => ({ rows: [{ total: "0", healthy: "0" }] }));

    const total = Number(uptime.rows[0]?.total ?? 0);
    const healthy = Number(uptime.rows[0]?.healthy ?? 0);

    response.json({
      data: {
        status: overall,
        components,
        checks: {
          // Null rather than 100 when nothing has been measured: an untested
          // system is not a perfect one.
          last24hSuccessRate: total > 0 ? Math.round((healthy / total) * 1000) / 10 : null,
          sampleCount: total,
        },
        measuredAt: new Date().toISOString(),
      },
    });
  }),
);
