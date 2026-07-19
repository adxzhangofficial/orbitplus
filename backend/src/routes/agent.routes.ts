import { Router } from "express";
import { fileURLToPath } from "node:url";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { unauthorized } from "../lib/errors.js";
import { generateToken, hashToken } from "../lib/tokens.js";

/**
 * Endpoints the server agent calls.
 *
 * Unauthenticated by session on purpose: the caller is a machine, not a
 * browser, and it authenticates with its own token. These routes are mounted
 * outside the customer router for that reason.
 *
 * Every route here is write-only from the agent's side. Nothing returns
 * instructions, commands, or paths to act on, so a compromised Orbit cannot use
 * an enrolled agent to do anything to the customer's machine. That boundary is
 * the reason the agent is safe to install at all, and it must not be relaxed to
 * add "just one" command channel later.
 */

export const agentRouter = Router();

/**
 * Serves the install script.
 *
 * Public and unauthenticated because it contains no secret: the enrolment
 * token is supplied by the operator as an environment variable when they run
 * it. Serving it as plain text means it can be read before it is run, which is
 * the minimum owed to anyone being asked to execute a script as root.
 */
agentRouter.get("/install.sh", (_request, response) => {
  const script = fileURLToPath(new URL("../agent/install.sh", import.meta.url));
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("cache-control", "no-cache");
  response.sendFile(script, (error) => {
    if (error && !response.headersSent) response.status(404).send("# install script unavailable\n");
  });
});

const reportLimit = rateLimit({
  windowMs: 60_000,
  limit: env.NODE_ENV === "test" ? 10_000 : 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Per agent rather than per address, so many agents behind one NAT are not
  // rate limited as if they were a single caller. The address fallback goes
  // through ipKeyGenerator because a raw IPv6 address would let one client
  // sidestep the limit by varying the low bits of its /64.
  keyGenerator: (request) => request.header("x-orbit-agent-token")?.slice(0, 32) ?? ipKeyGenerator(request.ip ?? ""),
});

const enrollSchema = z.object({
  enrollmentToken: z.string().min(10).max(200),
  hostname: z.string().trim().max(253).optional(),
  platform: z.string().trim().max(120).optional(),
  agentVersion: z.string().trim().max(40).optional(),
});

const entrySchema = z.object({
  path: z.string().min(1).max(4096),
  type: z.enum(["file", "directory", "symlink"]),
  size: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  mode: z.string().max(8).optional(),
  modifiedAt: z.number().nonnegative().optional(),
});

const reportSchema = z.object({
  metrics: z.object({
    cpuPercent: z.number().min(0).max(100).optional(),
    memoryPercent: z.number().min(0).max(100).optional(),
    diskPercent: z.number().min(0).max(100).optional(),
    uptimeSeconds: z.number().nonnegative().optional(),
    loadAverage: z.number().nonnegative().optional(),
  }).optional(),
  // Omitted on metric-only reports, which are far more frequent than tree
  // reports because walking the filesystem is the expensive part.
  entries: z.array(entrySchema).max(200_000).optional(),
  truncated: z.boolean().default(false),
});

async function authenticateAgent(token: string | undefined) {
  if (!token) throw unauthorized("Agent token required");
  const result = await pool.query<{
    id: string; organization_id: string; server_id: string; status: string;
  }>(
    "SELECT id, organization_id, server_id, status FROM server_agents WHERE agent_token_hash = $1",
    [hashToken(token)],
  );
  const agent = result.rows[0];
  if (!agent || agent.status === "revoked") throw unauthorized("This agent is not enrolled");
  return agent;
}

/**
 * Exchanges a single-use enrolment token for a long-lived agent token.
 *
 * The enrolment token is consumed atomically by the UPDATE predicate, so two
 * machines running the same install command cannot both enrol.
 */
agentRouter.post(
  "/enroll",
  rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === "test" ? 1_000 : 10, standardHeaders: "draft-8", legacyHeaders: false }),
  asyncHandler(async (request, response) => {
    const input = enrollSchema.parse(request.body);
    const agentToken = generateToken();

    const result = await pool.query<{ id: string; server_id: string; report_interval_seconds: number }>(
      `UPDATE server_agents
          SET agent_token_hash = $2, status = 'active', hostname = $3, platform = $4,
              agent_version = $5, enrollment_token_hash = NULL, enrollment_expires_at = NULL,
              last_seen_at = now(), updated_at = now()
        WHERE enrollment_token_hash = $1
          AND enrollment_expires_at > now()
          AND status = 'pending'
        RETURNING id, server_id, report_interval_seconds`,
      [
        hashToken(input.enrollmentToken), hashToken(agentToken),
        input.hostname ?? null, input.platform ?? null, input.agentVersion ?? null,
      ],
    );
    if (!result.rowCount) throw unauthorized("This enrolment token is invalid, already used, or expired");

    response.status(201).json({
      data: {
        agentToken,
        serverId: result.rows[0]!.server_id,
        reportIntervalSeconds: result.rows[0]!.report_interval_seconds,
      },
    });
  }),
);

/**
 * Receives one report.
 *
 * Metrics and the directory tree arrive on the same endpoint because the agent
 * sends whichever it has: metrics on every cycle, the tree only when it has
 * been rewalked.
 */
agentRouter.post(
  "/report",
  reportLimit,
  asyncHandler(async (request, response) => {
    const agent = await authenticateAgent(request.header("x-orbit-agent-token") ?? undefined);
    const input = reportSchema.parse(request.body);

    if (input.metrics) {
      const { cpuPercent, memoryPercent, diskPercent } = input.metrics;
      await pool.query(
        `INSERT INTO monitors(organization_id, server_id, status, cpu_percent, memory_percent, disk_percent, services, source)
         VALUES($1, $2, 'healthy', $3, $4, $5, '[]'::jsonb, 'agent')`,
        [agent.organization_id, agent.server_id, cpuPercent ?? null, memoryPercent ?? null, diskPercent ?? null],
      );
      // The agent reporting at all is proof the host is up, which a failed
      // outbound probe from Orbit cannot establish.
      await pool.query(
        "UPDATE server_connections SET status = 'online', last_checked_at = now() WHERE id = $1",
        [agent.server_id],
      );
    }

    if (input.entries) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM remote_entries WHERE server_id = $1", [agent.server_id]);

        const BATCH = 500;
        for (let index = 0; index < input.entries.length; index += BATCH) {
          const batch = input.entries.slice(index, index + BATCH);
          const values: unknown[] = [];
          const tuples = batch.map((entry, offset) => {
            const segments = entry.path.split("/").filter(Boolean);
            const base = offset * 9;
            values.push(
              agent.organization_id, agent.server_id, entry.path,
              segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "/",
              segments.at(-1) ?? entry.path, entry.type, entry.size, entry.mode ?? null,
              entry.modifiedAt ? new Date(entry.modifiedAt * 1000) : null,
            );
            return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`;
          });
          await client.query(
            `INSERT INTO remote_entries(organization_id, server_id, path, parent_path, name, type, size_bytes, mode, modified_at)
             VALUES ${tuples.join(",")} ON CONFLICT (server_id, path) DO NOTHING`,
            values,
          );
        }

        await client.query(
          `INSERT INTO remote_index_runs(server_id, organization_id, status, entry_count, truncated, source, completed_at, updated_at)
           VALUES($1, $2, 'ready', $3, $4, 'agent', now(), now())
           ON CONFLICT (server_id) DO UPDATE SET
             status = 'ready', entry_count = EXCLUDED.entry_count, truncated = EXCLUDED.truncated,
             source = 'agent', error_message = NULL, completed_at = now(), updated_at = now()`,
          [agent.server_id, agent.organization_id, input.entries.length, input.truncated],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    await pool.query(
      `UPDATE server_agents
          SET last_seen_at = now(), last_report_at = now(),
              reports_received = reports_received + 1, status = 'active', updated_at = now()
        WHERE id = $1`,
      [agent.id],
    );

    // Only pacing is returned. Nothing here can instruct the agent to read,
    // write, or run anything.
    response.json({ data: { received: true, reportIntervalSeconds: 60 } });
  }),
);
