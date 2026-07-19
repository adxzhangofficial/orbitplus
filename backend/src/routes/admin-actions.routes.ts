import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { revokeAllSessions } from "../services/session.service.js";
import { recordPlatformAction } from "../services/platform-audit.service.js";

/**
 * Platform-admin write operations.
 *
 * Every action here reaches into a customer's account, so each one records who
 * did it and why before it is considered done. A reason is required rather than
 * optional: "why is this account disabled" is the first question asked
 * afterwards, and the audit row is the only place the answer can live.
 */

export const adminActionsRouter = Router();

const reasonSchema = z.string().trim().min(4).max(500);

/* --------------------------------------------------------------------------
 * Organizations
 * ------------------------------------------------------------------------ */

adminActionsRouter.post(
  "/organizations/:id/suspend",
  asyncHandler(async (request, response) => {
    const input = z.object({ reason: reasonSchema }).parse(request.body);
    const organizationId = routeParam(request, "id");

    const result = await pool.query<{ id: string; name: string }>(
      `UPDATE organizations
          SET status = 'suspended', suspended_at = now(), suspended_reason = $2, suspended_by = $3, updated_at = now()
        WHERE id = $1 AND status <> 'suspended'
        RETURNING id, name`,
      [organizationId, input.reason, request.auth!.userId],
    );
    if (!result.rowCount) throw notFound("Active organization");

    // Sessions are ended too. Leaving them alive would mean a suspended tenant
    // keeps working until their tokens happen to expire.
    const members = await pool.query<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE organization_id = $1",
      [organizationId],
    );
    for (const member of members.rows) {
      await revokeAllSessions(member.user_id, "organization_suspended").catch(() => undefined);
    }

    await recordPlatformAction(request, {
      action: "organization.suspend",
      targetType: "organization",
      targetId: organizationId,
      organizationId,
      reason: input.reason,
      metadata: { sessionsRevoked: members.rowCount },
    });

    response.json({ data: { ...result.rows[0], status: "suspended", sessionsRevoked: members.rowCount } });
  }),
);

adminActionsRouter.post(
  "/organizations/:id/restore",
  asyncHandler(async (request, response) => {
    const input = z.object({ reason: reasonSchema }).parse(request.body);
    const organizationId = routeParam(request, "id");

    const result = await pool.query<{ id: string; name: string }>(
      `UPDATE organizations
          SET status = 'active', suspended_at = NULL, suspended_reason = NULL, suspended_by = NULL, updated_at = now()
        WHERE id = $1 AND status = 'suspended'
        RETURNING id, name`,
      [organizationId],
    );
    if (!result.rowCount) throw notFound("Suspended organization");

    await recordPlatformAction(request, {
      action: "organization.restore",
      targetType: "organization",
      targetId: organizationId,
      organizationId,
      reason: input.reason,
    });
    response.json({ data: { ...result.rows[0], status: "active" } });
  }),
);

/* --------------------------------------------------------------------------
 * Users
 * ------------------------------------------------------------------------ */

adminActionsRouter.post(
  "/users/:id/suspend",
  asyncHandler(async (request, response) => {
    const input = z.object({ reason: reasonSchema }).parse(request.body);
    const userId = routeParam(request, "id");
    // An operator locking themselves out cannot undo it through the product.
    if (userId === request.auth!.userId) throw conflict("You cannot suspend your own account");

    const result = await pool.query<{ id: string; email: string }>(
      `UPDATE users
          SET active = false, suspended_at = now(), suspended_reason = $2, suspended_by = $3, updated_at = now()
        WHERE id = $1 AND active = true
        RETURNING id, email`,
      [userId, input.reason, request.auth!.userId],
    );
    if (!result.rowCount) throw notFound("Active user");

    await revokeAllSessions(userId, "account_suspended");
    await recordPlatformAction(request, {
      action: "user.suspend",
      targetType: "user",
      targetId: userId,
      reason: input.reason,
      metadata: { email: result.rows[0]!.email },
    });
    response.json({ data: { ...result.rows[0], active: false } });
  }),
);

adminActionsRouter.post(
  "/users/:id/restore",
  asyncHandler(async (request, response) => {
    const input = z.object({ reason: reasonSchema }).parse(request.body);
    const userId = routeParam(request, "id");
    const result = await pool.query<{ id: string; email: string }>(
      `UPDATE users
          SET active = true, suspended_at = NULL, suspended_reason = NULL, suspended_by = NULL, updated_at = now()
        WHERE id = $1 AND active = false
        RETURNING id, email`,
      [userId],
    );
    if (!result.rowCount) throw notFound("Suspended user");

    await recordPlatformAction(request, {
      action: "user.restore", targetType: "user", targetId: userId, reason: input.reason,
    });
    response.json({ data: { ...result.rows[0], active: true } });
  }),
);

/** Ends every session without disabling the account, for a suspected theft. */
adminActionsRouter.post(
  "/users/:id/revoke-sessions",
  asyncHandler(async (request, response) => {
    const input = z.object({ reason: reasonSchema }).parse(request.body);
    const userId = routeParam(request, "id");
    const found = await pool.query("SELECT 1 FROM users WHERE id = $1", [userId]);
    if (!found.rowCount) throw notFound("User");

    await revokeAllSessions(userId, "revoked_by_platform_admin");
    await recordPlatformAction(request, {
      action: "user.revoke_sessions", targetType: "user", targetId: userId, reason: input.reason,
    });
    response.status(204).send();
  }),
);

/* --------------------------------------------------------------------------
 * Feature flags
 * ------------------------------------------------------------------------ */

adminActionsRouter.get(
  "/feature-flags",
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT key, name, description, enabled, rollout_percent AS "rolloutPercent",
              enabled_organizations AS "enabledOrganizations",
              disabled_organizations AS "disabledOrganizations",
              updated_at AS "updatedAt"
         FROM feature_flags ORDER BY key`,
    );
    response.json({ data: result.rows });
  }),
);

adminActionsRouter.put(
  "/feature-flags/:key",
  asyncHandler(async (request, response) => {
    const key = routeParam(request, "key");
    if (!/^[a-z0-9_.-]+$/.test(key)) throw badRequest("Flag keys use lowercase letters, numbers, dots, underscores, and hyphens");

    const input = z.object({
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).default(""),
      enabled: z.boolean().default(false),
      rolloutPercent: z.number().int().min(0).max(100).default(0),
      enabledOrganizations: z.array(z.string().uuid()).max(500).default([]),
      disabledOrganizations: z.array(z.string().uuid()).max(500).default([]),
    }).parse(request.body);

    const result = await pool.query(
      `INSERT INTO feature_flags(key, name, description, enabled, rollout_percent, enabled_organizations, disabled_organizations, updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, enabled = EXCLUDED.enabled,
         rollout_percent = EXCLUDED.rollout_percent,
         enabled_organizations = EXCLUDED.enabled_organizations,
         disabled_organizations = EXCLUDED.disabled_organizations,
         updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING key, name, enabled, rollout_percent AS "rolloutPercent"`,
      [key, input.name, input.description, input.enabled, input.rolloutPercent,
       input.enabledOrganizations, input.disabledOrganizations, request.auth!.userId],
    );

    await recordPlatformAction(request, {
      action: "feature_flag.update",
      targetType: "feature_flag",
      targetId: key,
      metadata: { enabled: input.enabled, rolloutPercent: input.rolloutPercent },
    });
    response.json({ data: result.rows[0] });
  }),
);

adminActionsRouter.delete(
  "/feature-flags/:key",
  asyncHandler(async (request, response) => {
    const key = routeParam(request, "key");
    const result = await pool.query("DELETE FROM feature_flags WHERE key = $1 RETURNING key", [key]);
    if (!result.rowCount) throw notFound("Feature flag");
    await recordPlatformAction(request, { action: "feature_flag.delete", targetType: "feature_flag", targetId: key });
    response.status(204).send();
  }),
);

/* --------------------------------------------------------------------------
 * Support
 * ------------------------------------------------------------------------ */

adminActionsRouter.get(
  "/support/tickets",
  asyncHandler(async (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : "";
    const result = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at AS "createdAt",
              t.updated_at AS "updatedAt", t.resolved_at AS "resolvedAt",
              o.name AS "organizationName", o.plan, u.name AS "openedByName",
              a.name AS "assignedToName",
              (SELECT count(*)::integer FROM support_messages WHERE ticket_id = t.id) AS "messageCount"
         FROM support_tickets t
         LEFT JOIN organizations o ON o.id = t.organization_id
         LEFT JOIN users u ON u.id = t.opened_by
         LEFT JOIN users a ON a.id = t.assigned_to
        WHERE ($1 = '' OR t.status = $1)
        ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                 t.created_at DESC
        LIMIT 100`,
      [status],
    );
    response.json({ data: result.rows });
  }),
);

adminActionsRouter.get(
  "/support/tickets/:id",
  asyncHandler(async (request, response) => {
    const ticketId = routeParam(request, "id");
    const [ticket, messages] = await Promise.all([
      pool.query(
        `SELECT t.id, t.subject, t.body, t.status, t.priority, t.created_at AS "createdAt",
                o.name AS "organizationName", o.id AS "organizationId", u.name AS "openedByName"
           FROM support_tickets t
           LEFT JOIN organizations o ON o.id = t.organization_id
           LEFT JOIN users u ON u.id = t.opened_by
          WHERE t.id = $1`,
        [ticketId],
      ),
      pool.query(
        `SELECT m.id, m.body, m.author_role AS "authorRole", m.created_at AS "createdAt", u.name AS "authorName"
           FROM support_messages m LEFT JOIN users u ON u.id = m.author_id
          WHERE m.ticket_id = $1 ORDER BY m.created_at`,
        [ticketId],
      ),
    ]);
    if (!ticket.rows[0]) throw notFound("Ticket");
    response.json({ data: { ...ticket.rows[0], messages: messages.rows } });
  }),
);

adminActionsRouter.post(
  "/support/tickets/:id/reply",
  asyncHandler(async (request, response) => {
    const input = z.object({
      body: z.string().trim().min(1).max(10_000),
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
    }).parse(request.body);
    const ticketId = routeParam(request, "id");

    const found = await pool.query("SELECT 1 FROM support_tickets WHERE id = $1", [ticketId]);
    if (!found.rowCount) throw notFound("Ticket");

    await pool.query(
      "INSERT INTO support_messages(ticket_id, author_id, author_role, body) VALUES($1,$2,'operator',$3)",
      [ticketId, request.auth!.userId, input.body],
    );
    await pool.query(
      `UPDATE support_tickets SET
         status = COALESCE($2, CASE WHEN status = 'open' THEN 'pending' ELSE status END),
         assigned_to = COALESCE(assigned_to, $3),
         resolved_at = CASE WHEN $2 IN ('resolved', 'closed') THEN now() ELSE resolved_at END,
         updated_at = now()
       WHERE id = $1`,
      [ticketId, input.status ?? null, request.auth!.userId],
    );

    await recordPlatformAction(request, {
      action: "support.reply", targetType: "ticket", targetId: ticketId,
      metadata: { status: input.status ?? "pending" },
    });
    response.status(201).json({ data: { replied: true } });
  }),
);

/* --------------------------------------------------------------------------
 * Jobs
 * ------------------------------------------------------------------------ */

/** Queue depth per state, so a stalled worker is visible rather than inferred. */
adminActionsRouter.get(
  "/jobs",
  asyncHandler(async (_request, response) => {
    const { getBoss, QUEUES } = await import("../queue/index.js");
    const boss = await getBoss();
    const queues = await Promise.all(
      Object.values(QUEUES).map(async (name) => {
        const queue = await boss.getQueue(name).catch(() => null);
        return {
          name,
          ready: queue?.readyCount ?? 0,
          active: queue?.activeCount ?? 0,
          deferred: queue?.deferredCount ?? 0,
          failed: queue?.failedCount ?? 0,
          total: queue?.totalCount ?? 0,
        };
      }),
    );
    response.json({ data: queues });
  }),
);

/* --------------------------------------------------------------------------
 * Platform audit
 * ------------------------------------------------------------------------ */

adminActionsRouter.get(
  "/platform-audit",
  asyncHandler(async (request, response) => {
    const action = typeof request.query.action === "string" ? request.query.action : "";
    const result = await pool.query(
      // Qualified because the join brings organizations into scope, and both
      // tables have id and name.
      `SELECT p.id, p.actor_email AS "actorEmail", p.action, p.target_type AS "targetType",
              p.target_id AS "targetId", p.reason, p.metadata, p.ip, p.created_at AS "createdAt",
              o.name AS "organizationName"
         FROM platform_audit p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE ($1 = '' OR p.action = $1)
        ORDER BY p.created_at DESC LIMIT 200`,
      [action],
    );
    response.json({ data: result.rows });
  }),
);
