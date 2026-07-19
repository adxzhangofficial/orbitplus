import { withAdapter } from "../adapters/index.js";
import { breakerFor } from "../adapters/connection-pool.js";
import { pool } from "../database/pool.js";
// Aliased because `dispatchEvent` is also a global in the DOM lib, and an
// unqualified call silently resolved to that instead of this module.
import { dispatchEvent as dispatchIntegrationEvent } from "../services/integration.service.js";
import { pruneAuthTokens } from "../services/auth-token.service.js";
import { pruneExpiredVersions } from "../services/file.service.js";

/**
 * Probes every active server on a schedule.
 *
 * Latency and connection status were only ever refreshed when someone pressed
 * "Probe now", so a server's readings sat frozen at whatever the last manual
 * check produced and looked stale or wrong. This keeps them current without
 * anyone touching the interface.
 *
 * Servers whose circuit breaker is open are skipped rather than retried: they
 * are already known to be unreachable, and probing them would spend the whole
 * sweep waiting out connect timeouts.
 */
export async function runHealthSweep(): Promise<{ probed: number; skipped: number; failed: number }> {
  const servers = await pool.query<{
    id: string; organization_id: string; name: string; adapter_mode: string;
  }>(
    `SELECT s.id, s.organization_id, s.name, s.adapter_mode
       FROM server_connections s
       JOIN organizations o ON o.id = s.organization_id
      WHERE o.status IN ('active', 'trialing')
      ORDER BY s.last_checked_at NULLS FIRST
      LIMIT 200`,
  );

  let probed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of servers.rows) {
    if (breakerFor(row.id)) { skipped += 1; continue; }

    const server = await pool.query(
      "SELECT * FROM server_connections WHERE id = $1",
      [row.id],
    );
    const record = server.rows[0];
    if (!record) continue;

    const started = Date.now();
    let ok = false;
    let latencyMs = 0;
    let message = "";
    try {
      const health = await withAdapter(record, (adapter) => adapter.health());
      ok = health.ok;
      latencyMs = health.latencyMs || Date.now() - started;
      message = health.message;
      probed += 1;
    } catch (error) {
      message = error instanceof Error ? error.message : "Probe failed";
      failed += 1;
    }

    await pool.query(
      `INSERT INTO monitors(organization_id, server_id, status, latency_ms, services, source)
       VALUES($1, $2, $3, $4, $5::jsonb, 'probe')`,
      [
        row.organization_id, row.id, ok ? "healthy" : "critical",
        ok ? latencyMs : null,
        JSON.stringify([{ name: "sftp", status: ok ? "up" : "down", message: message.slice(0, 300) }]),
      ],
    );
    // Compared against the stored status so only a transition is announced.
    // Emitting on every sweep would send an alert a minute for a host that is
    // simply down, which trains people to ignore the channel.
    const previous = await pool.query<{ status: string }>(
      "SELECT status FROM server_connections WHERE id = $1",
      [row.id],
    );
    const wasOnline = previous.rows[0]?.status === "online";

    await pool.query(
      `UPDATE server_connections
          SET status = $2, last_checked_at = now(), last_latency_ms = $3
        WHERE id = $1`,
      [row.id, ok ? "online" : "offline", ok ? latencyMs : null],
    );

    if (wasOnline !== ok) {
      await dispatchIntegrationEvent({
        event: ok ? "server.online" : "server.offline",
        organizationId: row.organization_id,
        title: ok ? `${row.name} is reachable again` : `${row.name} is unreachable`,
        message: ok
          ? `Responded in ${latencyMs} ms.`
          : message.slice(0, 400) || "The connection could not be established.",
        severity: ok ? "success" : "critical",
        resource: { type: "server", id: row.id, name: row.name },
        occurredAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
  }

  return { probed, skipped, failed };
}

/** Marks agents that have stopped reporting, so the UI can show them as stale. */
export async function markStaleAgents(): Promise<number> {
  const result = await pool.query(
    `UPDATE server_agents
        SET status = 'stale', updated_at = now()
      WHERE status = 'active'
        AND last_report_at IS NOT NULL
        AND last_report_at < now() - interval '5 minutes'`,
  );
  return result.rowCount ?? 0;
}

/** Keeps the metrics table bounded; a probe every 30s is 2,880 rows per server per day. */
export async function pruneOldMetrics(): Promise<number> {
  const result = await pool.query(
    "DELETE FROM monitors WHERE sampled_at < now() - interval '7 days'",
  );
  return result.rowCount ?? 0;
}
