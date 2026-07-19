import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";

export const adminRouter = Router();

adminRouter.get(
  "/overview",
  asyncHandler(async (_request, response) => {
    const [counts, revenue, growth, health, recentCustomers] = await Promise.all([
      pool.query(
        `SELECT
          (SELECT count(*)::integer FROM users) AS users,
          (SELECT count(*)::integer FROM organizations) AS organizations,
          (SELECT count(*)::integer FROM server_connections) AS servers,
          (SELECT count(*)::integer FROM transfers WHERE status = 'running') AS "activeTransfers",
          (SELECT count(*)::integer FROM alerts WHERE status = 'open' AND severity = 'critical') AS "criticalAlerts",
          (SELECT count(*)::integer FROM organizations WHERE status = 'suspended') AS "suspendedOrganizations"`,
      ),
      pool.query(
        `SELECT COALESCE(sum(CASE WHEN interval = 'yearly' THEN amount_cents / 12 ELSE amount_cents END), 0)::integer AS "monthlyRecurringCents",
                count(*) FILTER (WHERE plan = 'free')::integer AS free,
                count(*) FILTER (WHERE plan = 'pro')::integer AS pro,
                count(*) FILTER (WHERE plan = 'enterprise')::integer AS enterprise
           FROM subscriptions WHERE status IN ('active', 'trialing')`,
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, count(*)::integer AS organizations
           FROM organizations WHERE created_at >= now() - interval '30 days'
          GROUP BY date_trunc('day', created_at) ORDER BY date_trunc('day', created_at)`,
      ),
      pool.query(
        `SELECT
          count(*) FILTER (WHERE status = 'online')::integer AS online,
          count(*) FILTER (WHERE status = 'offline')::integer AS offline,
          count(*) FILTER (WHERE status IN ('unknown', 'degraded'))::integer AS unknown
        FROM server_connections`,
      ),
      pool.query(
        `SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at AS "createdAt",
                count(DISTINCT m.id)::integer AS members, count(DISTINCT s.id)::integer AS servers
           FROM organizations o
           LEFT JOIN memberships m ON m.organization_id = o.id
           LEFT JOIN server_connections s ON s.organization_id = o.id
          GROUP BY o.id ORDER BY o.created_at DESC LIMIT 8`,
      ),
    ]);
    response.json({ data: { counts: counts.rows[0], revenue: revenue.rows[0], growth: growth.rows, infrastructure: health.rows[0], recentCustomers: recentCustomers.rows } });
  }),
);

adminRouter.get(
  "/customers",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const status = typeof request.query.status === "string" ? request.query.status : "";
    const plan = typeof request.query.plan === "string" ? request.query.plan : "";
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at AS "createdAt",
                count(DISTINCT m.id)::integer AS members, count(DISTINCT w.id)::integer AS workspaces,
                count(DISTINCT s.id)::integer AS servers,
                COALESCE(sum(DISTINCT b.size_bytes), 0) AS "backupBytes"
           FROM organizations o
           LEFT JOIN memberships m ON m.organization_id = o.id AND m.status = 'active'
           LEFT JOIN workspaces w ON w.organization_id = o.id
           LEFT JOIN server_connections s ON s.organization_id = o.id
           LEFT JOIN backups b ON b.organization_id = o.id AND b.status = 'completed'
          WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%' OR o.slug ILIKE '%' || $1 || '%')
            AND ($2 = '' OR o.status = $2) AND ($3 = '' OR o.plan = $3)
          GROUP BY o.id ORDER BY o.created_at DESC LIMIT $4 OFFSET $5`,
        [search, status, plan, limit, offset],
      ),
      pool.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM organizations o
          WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%' OR o.slug ILIKE '%' || $1 || '%')
            AND ($2 = '' OR o.status = $2) AND ($3 = '' OR o.plan = $3)`,
        [search, status, plan],
      ),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);

adminRouter.get(
  "/customers/:id",
  asyncHandler(async (request, response) => {
    const [organization, members, servers, usage, activity] = await Promise.all([
      pool.query("SELECT id, name, slug, plan, status, settings, created_at AS \"createdAt\", updated_at AS \"updatedAt\" FROM organizations WHERE id = $1", [request.params.id]),
      pool.query(`SELECT u.id, u.name, u.email, m.role, m.status, m.created_at AS "joinedAt" FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = $1 ORDER BY m.created_at`, [request.params.id]),
      pool.query(`SELECT id, name, host, environment, status, last_checked_at AS "lastCheckedAt" FROM server_connections WHERE organization_id = $1 ORDER BY name`, [request.params.id]),
      pool.query(`SELECT (SELECT count(*)::integer FROM transfers WHERE organization_id = $1) AS transfers, (SELECT count(*)::integer FROM backups WHERE organization_id = $1) AS backups, (SELECT count(*)::integer FROM deployments WHERE organization_id = $1) AS deployments`, [request.params.id]),
      pool.query(`SELECT id, action, resource_type AS "resourceType", created_at AS "createdAt" FROM audit_events WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 20`, [request.params.id]),
    ]);
    if (!organization.rows[0]) throw notFound("Customer");
    response.json({ data: { organization: organization.rows[0], members: members.rows, servers: servers.rows, usage: usage.rows[0], recentActivity: activity.rows } });
  }),
);

adminRouter.patch(
  "/customers/:id",
  asyncHandler(async (request, response) => {
    const input = z.object({ plan: z.enum(["free", "pro", "enterprise"]).optional(), status: z.enum(["active", "trialing", "suspended", "cancelled"]).optional() }).refine((value) => value.plan || value.status, "A plan or status is required").parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE organizations SET plan = COALESCE($2, plan), status = COALESCE($3, status)
          WHERE id = $1 RETURNING id, name, slug, plan, status, updated_at AS "updatedAt"`,
        [request.params.id, input.plan ?? null, input.status ?? null],
      );
      if (!result.rows[0]) throw notFound("Customer");
      if (input.plan) await client.query("UPDATE subscriptions SET plan = $2 WHERE organization_id = $1", [request.params.id, input.plan]);
      await client.query("COMMIT");
      response.json({ data: result.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }),
);

adminRouter.get(
  "/system",
  asyncHandler(async (_request, response) => {
    const started = Date.now();
    const [database, tables, failures, migrations] = await Promise.all([
      pool.query(`SELECT current_database() AS database, version() AS version, pg_database_size(current_database()) AS "sizeBytes", now() AS "serverTime"`),
      pool.query(`SELECT relname AS table, n_live_tup AS "estimatedRows" FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20`),
      pool.query(`SELECT count(*) FILTER (WHERE status = 'failed')::integer AS "failedTransfers", count(*) FILTER (WHERE status = 'running')::integer AS "runningTransfers" FROM transfers WHERE created_at >= now() - interval '24 hours'`),
      pool.query(`SELECT name, applied_at AS "appliedAt" FROM schema_migrations ORDER BY applied_at DESC`),
    ]);
    response.json({ data: { api: { status: "healthy", uptimeSeconds: Math.round(process.uptime()), memory: process.memoryUsage(), nodeVersion: process.version }, database: { ...database.rows[0], latencyMs: Date.now() - started }, queue: failures.rows[0], tables: tables.rows, migrations: migrations.rows } });
  }),
);

adminRouter.get(
  "/activity",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT a.id, a.organization_id AS "organizationId", o.name AS organization, a.action,
                a.resource_type AS "resourceType", a.resource_id AS "resourceId", a.request_id AS "requestId",
                a.ip_address AS "ipAddress", a.metadata, a.created_at AS "createdAt", u.email AS actor
           FROM audit_events a LEFT JOIN organizations o ON o.id = a.organization_id LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM audit_events"),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);
