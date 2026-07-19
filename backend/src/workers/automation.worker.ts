import { CronExpressionParser } from "cron-parser";
import { withAdapter } from "../adapters/index.js";
import { pool } from "../database/pool.js";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { enqueue, QUEUES, type AutomationJob } from "../queue/index.js";
import { serverForTenant } from "../services/server.service.js";

interface AutomationRow {
  id: string;
  organization_id: string;
  name: string;
  action_type: "backup" | "deployment" | "sync" | "health_check" | "webhook";
  configuration: Record<string, unknown>;
  schedule: string | null;
  trigger_type: string;
  created_by: string | null;
}

/** Returns the next fire time, or null when the expression is unusable. */
export function nextRunAt(schedule: string, from: Date = new Date()): Date | null {
  try {
    return CronExpressionParser.parse(schedule, { currentDate: from }).next().toDate();
  } catch {
    return null;
  }
}

function configString(configuration: Record<string, unknown>, key: string): string | undefined {
  const value = configuration[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Executes one automation and records the outcome.
 *
 * Each action delegates to the same code paths the HTTP API uses, so a
 * scheduled backup and a manual one produce identical results.
 */
export async function runAutomation(job: AutomationJob): Promise<void> {
  const found = await pool.query<AutomationRow>(
    `SELECT id, organization_id, name, action_type, configuration, schedule, trigger_type, created_by
       FROM automations WHERE id = $1 AND organization_id = $2 AND enabled = true`,
    [job.automationId, job.organizationId],
  );
  const automation = found.rows[0];

  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO automation_runs(organization_id, automation_id, status, triggered_by, triggered_by_user, started_at)
     VALUES($1, $2, 'running', $3, $4, now()) RETURNING id`,
    [job.organizationId, job.automationId, job.triggeredBy, job.userId ?? null],
  );
  const runId = runResult.rows[0]!.id;

  if (!automation) {
    await pool.query(
      `UPDATE automation_runs SET status = 'skipped', finished_at = now(),
              error_message = 'Automation is disabled or no longer exists' WHERE id = $1`,
      [runId],
    );
    return;
  }

  try {
    const result = await execute(automation, job);
    await pool.query(
      "UPDATE automation_runs SET status = 'succeeded', result = $2::jsonb, finished_at = now() WHERE id = $1",
      [runId, JSON.stringify(result)],
    );
  } catch (error) {
    await pool.query(
      "UPDATE automation_runs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1",
      [runId, error instanceof Error ? error.message.slice(0, 1000) : "Automation failed"],
    );
    throw error;
  } finally {
    // last_run_at reflects an actual attempt. next_run_at is recomputed from
    // the cron expression rather than the fixed "+1 day" the API used to write.
    const next = automation.schedule && automation.trigger_type === "schedule"
      ? nextRunAt(automation.schedule)
      : null;
    await pool.query("UPDATE automations SET last_run_at = now(), next_run_at = $2 WHERE id = $1", [
      automation.id,
      next,
    ]);
  }
}

async function execute(automation: AutomationRow, job: AutomationJob): Promise<Record<string, unknown>> {
  const serverId = configString(automation.configuration, "serverId");

  switch (automation.action_type) {
    case "backup": {
      if (!serverId) throw new Error("This backup automation has no serverId configured");
      const server = await serverForTenant(automation.organization_id, serverId);
      const backup = await pool.query<{ id: string }>(
        `INSERT INTO backups(organization_id, server_id, name, type, status, root_path, created_by)
         VALUES($1, $2, $3, 'full', 'queued', $4, $5) RETURNING id`,
        [
          automation.organization_id,
          server.id,
          `${automation.name} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
          server.root_path,
          automation.created_by,
        ],
      );
      const backupId = backup.rows[0]!.id;
      await enqueue(QUEUES.backup, {
        backupId,
        organizationId: automation.organization_id,
        serverId: server.id,
        userId: job.userId ?? automation.created_by ?? "",
        rootPath: server.root_path,
      });
      return { action: "backup", backupId };
    }

    case "health_check": {
      if (!serverId) throw new Error("This health check automation has no serverId configured");
      const server = await serverForTenant(automation.organization_id, serverId);
      let healthy = false;
      let latencyMs = 0;
      let message = "";
      try {
        const health = await withAdapter(server, (adapter) => adapter.health());
        healthy = health.ok;
        latencyMs = health.latencyMs;
        message = health.message;
      } catch (error) {
        message = error instanceof Error ? error.message : "Probe failed";
      }
      await pool.query(
        `INSERT INTO monitors(organization_id, server_id, status, latency_ms, services)
         VALUES($1, $2, $3, $4, $5::jsonb)`,
        [
          automation.organization_id, server.id, healthy ? "healthy" : "critical", latencyMs,
          JSON.stringify([{ name: "sftp", status: healthy ? "up" : "down", message }]),
        ],
      );
      await pool.query(
        "UPDATE server_connections SET status = $2, last_checked_at = now(), last_latency_ms = $3 WHERE id = $1",
        [server.id, healthy ? "online" : "offline", latencyMs],
      );
      if (!healthy) {
        await pool.query(
          `INSERT INTO alerts(organization_id, server_id, severity, title, message, status)
           VALUES($1, $2, 'critical', $3, $4, 'open')`,
          [automation.organization_id, server.id, `${server.name} is unreachable`, message.slice(0, 500)],
        );
      }
      return { action: "health_check", healthy, latencyMs };
    }

    case "sync": {
      if (!serverId) throw new Error("This sync automation has no serverId configured");
      const source = configString(automation.configuration, "sourcePath");
      const destination = configString(automation.configuration, "destinationPath");
      if (!source || !destination) throw new Error("Sync automations require sourcePath and destinationPath");
      const server = await serverForTenant(automation.organization_id, serverId);
      const transfer = await pool.query<{ id: string }>(
        `INSERT INTO transfers(organization_id, server_id, name, direction, source_path, destination_path, status, created_by)
         VALUES($1, $2, $3, 'sync', $4, $5, 'queued', $6) RETURNING id`,
        [
          automation.organization_id, server.id, `${automation.name} · sync`,
          normalizeRemotePath(source), normalizeRemotePath(destination), automation.created_by,
        ],
      );
      const transferId = transfer.rows[0]!.id;
      await enqueue(QUEUES.transfer, {
        transferId,
        organizationId: automation.organization_id,
        serverId: server.id,
        userId: job.userId ?? automation.created_by ?? "",
        direction: "sync",
        sourcePath: normalizeRemotePath(source),
        destinationPath: normalizeRemotePath(destination),
      });
      return { action: "sync", transferId };
    }

    case "webhook": {
      const url = configString(automation.configuration, "url");
      if (!url) throw new Error("Webhook automations require a url");
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Orbit-Automation/1.0" },
        body: JSON.stringify({
          automation: { id: automation.id, name: automation.name },
          organizationId: automation.organization_id,
          triggeredBy: job.triggeredBy,
          firedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
      return { action: "webhook", status: response.status };
    }

    case "deployment":
      // Deployments arrive in Phase 6; recording the run keeps the automation
      // honest instead of reporting a success that never happened.
      throw new Error("Deployment automations are not available yet");

    default:
      throw new Error(`Unsupported automation action: ${automation.action_type as string}`);
  }
}

/**
 * Sweeps for automations whose next run is due and enqueues them.
 *
 * next_run_at is advanced as part of the claiming UPDATE so a slow sweep or a
 * second worker cannot enqueue the same automation twice.
 */
export async function sweepDueAutomations(): Promise<number> {
  const due = await pool.query<{ id: string; organization_id: string; schedule: string | null }>(
    `SELECT id, organization_id, schedule
       FROM automations
      WHERE enabled = true AND trigger_type = 'schedule'
        AND next_run_at IS NOT NULL AND next_run_at <= now()
      ORDER BY next_run_at
      LIMIT 500
      FOR UPDATE SKIP LOCKED`,
  );

  for (const automation of due.rows) {
    const next = automation.schedule ? nextRunAt(automation.schedule) : null;
    await pool.query("UPDATE automations SET next_run_at = $2 WHERE id = $1", [automation.id, next]);
    await enqueue(
      QUEUES.automation,
      { automationId: automation.id, organizationId: automation.organization_id, triggeredBy: "schedule" },
      // Guards against a duplicate enqueue if a sweep overlaps itself.
      { singletonKey: `automation:${automation.id}:${automation.schedule ?? "once"}` },
    );
  }
  return due.rows.length;
}
