import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { forbidden } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";

const prices = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 2900, yearly: 29000 },
  enterprise: { monthly: 0, yearly: 0 },
} as const;

export const billingRouter = Router();

billingRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const [subscription, invoices, usage] = await Promise.all([
      pool.query(
        `SELECT s.id, s.plan, s.status, s.interval, s.amount_cents AS "amountCents", s.currency,
                s.current_period_start AS "currentPeriodStart", s.current_period_end AS "currentPeriodEnd",
                s.cancel_at_period_end AS "cancelAtPeriodEnd"
           FROM subscriptions s WHERE s.organization_id = $1`,
        [request.tenant!.organizationId],
      ),
      pool.query(
        `SELECT id, invoice_number AS "invoiceNumber", amount_cents AS "amountCents", currency,
                status, due_at AS "dueAt", paid_at AS "paidAt", created_at AS "createdAt"
           FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 24`,
        [request.tenant!.organizationId],
      ),
      pool.query(
        `SELECT
          (SELECT count(*)::integer FROM memberships WHERE organization_id = $1 AND status = 'active') AS members,
          (SELECT count(*)::integer FROM workspaces WHERE organization_id = $1) AS workspaces,
          (SELECT count(*)::integer FROM server_connections WHERE organization_id = $1) AS servers,
          (SELECT COALESCE(sum(size_bytes), 0) FROM backups WHERE organization_id = $1 AND status = 'completed') AS "backupBytes",
          (SELECT COALESCE(sum(bytes_transferred), 0) FROM transfers WHERE organization_id = $1 AND created_at >= date_trunc('month', now())) AS "transferBytes"`,
        [request.tenant!.organizationId],
      ),
    ]);
    response.json({ data: { subscription: subscription.rows[0], usage: usage.rows[0], invoices: invoices.rows } });
  }),
);

billingRouter.patch(
  "/plan",
  requireRole("owner"),
  asyncHandler(async (request, response) => {
    const input = z.object({ plan: z.enum(["free", "pro", "enterprise"]), interval: z.enum(["monthly", "yearly"]).default("monthly") }).parse(request.body);
    if (input.plan === "enterprise") {
      throw forbidden("Enterprise plans require a signed agreement and platform administrator approval");
    }
    const amount = prices[input.plan][input.interval];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE organizations SET plan = $2 WHERE id = $1", [request.tenant!.organizationId, input.plan]);
      const result = await client.query(
        `INSERT INTO subscriptions(organization_id, plan, interval, amount_cents, status)
         VALUES($1,$2,$3,$4,'active')
         ON CONFLICT(organization_id) DO UPDATE SET plan = EXCLUDED.plan, interval = EXCLUDED.interval,
           amount_cents = EXCLUDED.amount_cents, status = 'active', current_period_start = now(),
           current_period_end = now() + CASE WHEN EXCLUDED.interval = 'yearly' THEN interval '1 year' ELSE interval '1 month' END
         RETURNING id, plan, status, interval, amount_cents AS "amountCents", currency,
                   current_period_start AS "currentPeriodStart", current_period_end AS "currentPeriodEnd"`,
        [request.tenant!.organizationId, input.plan, input.interval, amount],
      );
      await client.query("COMMIT");
      response.json({ data: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }),
);
