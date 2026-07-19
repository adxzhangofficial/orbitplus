import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { revokeAllSessions } from "../services/session.service.js";
import { recordPlatformAction } from "../services/platform-audit.service.js";
import { firstResponseSla } from "../services/support-sla.js";

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
      `SELECT key, name, description, enabled, staging_enabled AS "stagingEnabled",
              owner, risk, rollout_percent AS "rolloutPercent",
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
      stagingEnabled: z.boolean().default(false),
      owner: z.string().trim().min(1).max(80).default("Platform"),
      risk: z.enum(["low", "medium", "high"]).default("low"),
      rolloutPercent: z.number().int().min(0).max(100).default(0),
      enabledOrganizations: z.array(z.string().uuid()).max(500).default([]),
      disabledOrganizations: z.array(z.string().uuid()).max(500).default([]),
    }).parse(request.body);

    // The previous production state decides whether this counts as a rollout,
    // which is the detail worth being able to search the audit log for later.
    const before = await pool.query<{ enabled: boolean }>(
      "SELECT enabled FROM feature_flags WHERE key = $1",
      [key],
    );

    const result = await pool.query(
      `INSERT INTO feature_flags(key, name, description, enabled, staging_enabled, owner, risk, rollout_percent, enabled_organizations, disabled_organizations, updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, enabled = EXCLUDED.enabled,
         staging_enabled = EXCLUDED.staging_enabled, owner = EXCLUDED.owner, risk = EXCLUDED.risk,
         rollout_percent = EXCLUDED.rollout_percent,
         enabled_organizations = EXCLUDED.enabled_organizations,
         disabled_organizations = EXCLUDED.disabled_organizations,
         updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING key, name, description, enabled, staging_enabled AS "stagingEnabled",
                 owner, risk, rollout_percent AS "rolloutPercent",
                 enabled_organizations AS "enabledOrganizations",
                 disabled_organizations AS "disabledOrganizations",
                 updated_at AS "updatedAt"`,
      [key, input.name, input.description, input.enabled, input.stagingEnabled, input.owner,
       input.risk, input.rolloutPercent, input.enabledOrganizations, input.disabledOrganizations,
       request.auth!.userId],
    );

    await recordPlatformAction(request, {
      action: "feature_flag.update",
      targetType: "feature_flag",
      targetId: key,
      metadata: {
        enabled: input.enabled,
        previouslyEnabled: before.rows[0]?.enabled ?? null,
        stagingEnabled: input.stagingEnabled,
        rolloutPercent: input.rolloutPercent,
        risk: input.risk,
      },
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

interface TicketRow {
  id: string;
  priority: string;
  status: string;
  plan: string | null;
  createdAt: Date;
  firstResponseAt: Date | null;
}

/** Attaches the first-response clock, which is derived rather than stored. */
function withSla<T extends TicketRow>(ticket: T) {
  return { ...ticket, sla: firstResponseSla(ticket) };
}

adminActionsRouter.get(
  "/support/tickets",
  asyncHandler(async (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : "";
    const result = await pool.query<TicketRow>(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at AS "createdAt",
              t.updated_at AS "updatedAt", t.resolved_at AS "resolvedAt",
              t.first_response_at AS "firstResponseAt",
              t.organization_id AS "organizationId",
              t.assigned_to AS "assignedToId",
              o.name AS "organizationName", o.plan, u.name AS "openedByName",
              a.name AS "assignedToName",
              (SELECT count(*)::integer FROM support_messages
                WHERE ticket_id = t.id AND author_role <> 'internal') AS "messageCount"
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
    response.json({ data: result.rows.map(withSla) });
  }),
);

/** Operators who can own a ticket, for the assignment control. */
adminActionsRouter.get(
  "/support/operators",
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT id, name, email FROM users
        WHERE platform_role = 'admin' AND active = true
        ORDER BY name`,
    );
    response.json({ data: result.rows });
  }),
);

/**
 * Queue health.
 *
 * Every figure is derived from the tickets themselves. Where there is nothing
 * to measure the value is null, so the console can say "no data yet" instead of
 * showing a confident zero.
 */
adminActionsRouter.get(
  "/support/metrics",
  asyncHandler(async (_request, response) => {
    const [counts, responses, weekly] = await Promise.all([
      pool.query<{ status: string; count: number }>(
        "SELECT status, count(*)::integer AS count FROM support_tickets GROUP BY status",
      ),
      pool.query<{ priority: string; plan: string | null; createdAt: Date; firstResponseAt: Date | null; status: string }>(
        `SELECT t.priority, o.plan, t.created_at AS "createdAt",
                t.first_response_at AS "firstResponseAt", t.status
           FROM support_tickets t LEFT JOIN organizations o ON o.id = t.organization_id
          WHERE t.created_at > now() - interval '30 days'`,
      ),
      pool.query<{ resolved: number; reopened: number; escalated: number }>(
        `SELECT
           (SELECT count(*)::integer FROM support_tickets
             WHERE resolved_at > now() - interval '7 days') AS resolved,
           (SELECT count(*)::integer FROM platform_audit
             WHERE action = 'support.reopen' AND created_at > now() - interval '7 days') AS reopened,
           (SELECT count(*)::integer FROM platform_audit
             WHERE action = 'support.escalate' AND created_at > now() - interval '7 days') AS escalated`,
      ),
    ]);

    const byStatus = Object.fromEntries(counts.rows.map((row) => [row.status, row.count]));
    const answered = responses.rows.filter((row) => row.firstResponseAt);
    const minutes = answered
      .map((row) => (new Date(row.firstResponseAt!).getTime() - new Date(row.createdAt).getTime()) / 60_000)
      .sort((a, b) => a - b);
    // Median, not mean: one ticket answered a week late should not move the
    // number that describes a typical wait.
    const median = minutes.length
      ? Math.round(minutes[Math.floor((minutes.length - 1) / 2)]!)
      : null;

    const judged = responses.rows.filter((row) => row.firstResponseAt || row.status === "resolved" || row.status === "closed");
    const attained = judged.filter((row) => firstResponseSla({ ...row, plan: row.plan }).met).length;

    response.json({
      data: {
        open: byStatus.open ?? 0,
        pending: byStatus.pending ?? 0,
        resolved: (byStatus.resolved ?? 0) + (byStatus.closed ?? 0),
        medianFirstResponseMinutes: median,
        slaAttainmentPercent: judged.length ? Math.round((attained / judged.length) * 1000) / 10 : null,
        sampleSize: judged.length,
        week: weekly.rows[0] ?? { resolved: 0, reopened: 0, escalated: 0 },
      },
    });
  }),
);

/** Open a ticket on a customer's behalf, for a conversation that began elsewhere. */
adminActionsRouter.post(
  "/support/tickets",
  asyncHandler(async (request, response) => {
    const input = z.object({
      organizationId: z.string().uuid(),
      subject: z.string().trim().min(3).max(200),
      body: z.string().trim().min(1).max(10_000),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    }).parse(request.body);

    const organization = await pool.query("SELECT 1 FROM organizations WHERE id = $1", [input.organizationId]);
    if (!organization.rowCount) throw notFound("Organization");

    const result = await pool.query<{ id: string }>(
      `INSERT INTO support_tickets(organization_id, opened_by, subject, body, priority, assigned_to)
       VALUES($1,$2,$3,$4,$5,$2) RETURNING id`,
      [input.organizationId, request.auth!.userId, input.subject, input.body, input.priority],
    );
    const ticketId = result.rows[0]!.id;

    // The opening description is also the first message, so the thread reads in
    // order rather than starting mid-conversation.
    await pool.query(
      "INSERT INTO support_messages(ticket_id, author_id, author_role, body) VALUES($1,$2,'customer',$3)",
      [ticketId, request.auth!.userId, input.body],
    );

    await recordPlatformAction(request, {
      action: "support.create", targetType: "ticket", targetId: ticketId,
      organizationId: input.organizationId,
      metadata: { priority: input.priority, onBehalf: true },
    });
    response.status(201).json({ data: { id: ticketId } });
  }),
);

/** Assignment, priority, and status, without sending the customer a message. */
adminActionsRouter.patch(
  "/support/tickets/:id",
  asyncHandler(async (request, response) => {
    const input = z.object({
      assignedTo: z.string().uuid().nullable().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
    }).parse(request.body);

    const ticketId = routeParam(request, "id");
    const before = await pool.query<{ status: string; priority: string; organization_id: string | null }>(
      "SELECT status, priority, organization_id FROM support_tickets WHERE id = $1",
      [ticketId],
    );
    const current = before.rows[0];
    if (!current) throw notFound("Ticket");

    const result = await pool.query<TicketRow>(
      `UPDATE support_tickets SET
         assigned_to = CASE WHEN $2::boolean THEN $3::uuid ELSE assigned_to END,
         priority = COALESCE($4, priority),
         status = COALESCE($5, status),
         resolved_at = CASE
           WHEN $5 IN ('resolved', 'closed') THEN COALESCE(resolved_at, now())
           WHEN $5 IN ('open', 'pending') THEN NULL
           ELSE resolved_at END,
         updated_at = now()
       WHERE id = $1
       RETURNING id, status, priority, assigned_to AS "assignedToId"`,
      [ticketId, input.assignedTo !== undefined, input.assignedTo ?? null, input.priority ?? null, input.status ?? null],
    );

    // Reopening and escalating are the two transitions worth being able to
    // count later, so they get their own action names rather than one generic
    // update everything has to be filtered out of.
    const reopened = (current.status === "resolved" || current.status === "closed")
      && (input.status === "open" || input.status === "pending");
    const rank = { low: 0, normal: 1, high: 2, urgent: 3 } as const;
    const escalated = Boolean(input.priority && rank[input.priority] > rank[current.priority as keyof typeof rank]);

    await recordPlatformAction(request, {
      action: reopened ? "support.reopen" : escalated ? "support.escalate" : "support.update",
      targetType: "ticket",
      targetId: ticketId,
      organizationId: current.organization_id ?? undefined,
      metadata: { from: { status: current.status, priority: current.priority }, to: input },
    });
    response.json({ data: result.rows[0] });
  }),
);

adminActionsRouter.get(
  "/support/tickets/:id",
  asyncHandler(async (request, response) => {
    const ticketId = routeParam(request, "id");
    const [ticket, messages] = await Promise.all([
      pool.query<TicketRow>(
        `SELECT t.id, t.subject, t.body, t.status, t.priority, t.created_at AS "createdAt",
                t.updated_at AS "updatedAt", t.resolved_at AS "resolvedAt",
                t.first_response_at AS "firstResponseAt",
                t.organization_id AS "organizationId", t.assigned_to AS "assignedToId",
                o.name AS "organizationName", o.plan, u.name AS "openedByName",
                a.name AS "assignedToName",
                (SELECT count(*)::integer FROM support_messages
                  WHERE ticket_id = t.id AND author_role <> 'internal') AS "messageCount"
           FROM support_tickets t
           LEFT JOIN organizations o ON o.id = t.organization_id
           LEFT JOIN users u ON u.id = t.opened_by
           LEFT JOIN users a ON a.id = t.assigned_to
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
    response.json({ data: { ...withSla(ticket.rows[0]), messages: messages.rows } });
  }),
);

adminActionsRouter.post(
  "/support/tickets/:id/reply",
  asyncHandler(async (request, response) => {
    const input = z.object({
      body: z.string().trim().min(1).max(10_000),
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
      // An internal note is recorded against the ticket but is not a reply: it
      // must not stop the first-response clock or move the ticket's status.
      internal: z.boolean().default(false),
    }).parse(request.body);
    const ticketId = routeParam(request, "id");

    const found = await pool.query("SELECT 1 FROM support_tickets WHERE id = $1", [ticketId]);
    if (!found.rowCount) throw notFound("Ticket");

    await pool.query(
      "INSERT INTO support_messages(ticket_id, author_id, author_role, body) VALUES($1,$2,$3,$4)",
      [ticketId, request.auth!.userId, input.internal ? "internal" : "operator", input.body],
    );

    if (input.internal) {
      await pool.query("UPDATE support_tickets SET updated_at = now() WHERE id = $1", [ticketId]);
    } else {
      await pool.query(
        `UPDATE support_tickets SET
           status = COALESCE($2, CASE WHEN status = 'open' THEN 'pending' ELSE status END),
           assigned_to = COALESCE(assigned_to, $3),
           -- Stamped once. A later reply must not overwrite when the customer
           -- was actually first answered.
           first_response_at = COALESCE(first_response_at, now()),
           resolved_at = CASE WHEN $2 IN ('resolved', 'closed') THEN now() ELSE resolved_at END,
           updated_at = now()
         WHERE id = $1`,
        [ticketId, input.status ?? null, request.auth!.userId],
      );
    }

    await recordPlatformAction(request, {
      action: input.internal ? "support.note" : "support.reply",
      targetType: "ticket", targetId: ticketId,
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
