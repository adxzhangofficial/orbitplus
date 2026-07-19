import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { AppError, forbidden } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { createCheckoutSession, createPortalSession, isStripeConfigured } from "../services/stripe.service.js";
import { usageSnapshot } from "../services/usage.service.js";

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

/**
 * Starts a hosted checkout for a paid plan.
 *
 * The plan is never changed here. It moves only when Stripe confirms payment
 * through the webhook, so a user cannot upgrade themselves by calling the API.
 */
billingRouter.post(
  "/checkout",
  requireRole("owner"),
  asyncHandler(async (request, response) => {
    const input = z.object({ plan: z.enum(["pro"]) }).parse(request.body);
    if (!isStripeConfigured()) {
      throw new AppError(503, "BILLING_NOT_CONFIGURED", "Payments are not configured on this deployment");
    }
    const url = await createCheckoutSession(request.tenant!.organizationId, input.plan);
    response.json({ data: { url } });
  }),
);

/** Hosted portal for card changes, cancellation, and invoice history. */
billingRouter.post(
  "/portal",
  requireRole("owner"),
  asyncHandler(async (request, response) => {
    if (!isStripeConfigured()) {
      throw new AppError(503, "BILLING_NOT_CONFIGURED", "Payments are not configured on this deployment");
    }
    const url = await createPortalSession(request.tenant!.organizationId);
    response.json({ data: { url } });
  }),
);

billingRouter.patch(
  "/plan",
  requireRole("owner"),
  asyncHandler(async (request, response) => {
    const input = z.object({ plan: z.enum(["free", "pro", "enterprise"]) }).parse(request.body);
    if (input.plan === "enterprise") {
      throw forbidden("Enterprise plans require a signed agreement and platform administrator approval");
    }
    // Upgrades must go through checkout. Allowing a direct plan write here
    // meant any owner could grant themselves a paid plan without paying.
    if (input.plan !== "free") {
      throw new AppError(
        402,
        "CHECKOUT_REQUIRED",
        "Start a checkout session to move to a paid plan",
        { checkout: "/api/v1/billing/checkout" },
      );
    }
    if (isStripeConfigured()) {
      throw new AppError(
        409,
        "MANAGE_IN_PORTAL",
        "Cancel your subscription from the billing portal so payment and access stay in sync",
        { portal: "/api/v1/billing/portal" },
      );
    }
    // Self-hosted deployments without a processor keep the direct path.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE organizations SET plan = 'free' WHERE id = $1", [request.tenant!.organizationId]);
      const result = await client.query(
        `INSERT INTO subscriptions(organization_id, plan, interval, amount_cents, status)
         VALUES($1,'free','monthly',0,'active')
         ON CONFLICT(organization_id) DO UPDATE SET plan = 'free', amount_cents = 0, status = 'active'
         RETURNING id, plan, status, interval, amount_cents AS "amountCents", currency,
                   current_period_start AS "currentPeriodStart", current_period_end AS "currentPeriodEnd"`,
        [request.tenant!.organizationId],
      );
      await client.query("COMMIT");
      response.json({ data: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }),
);

/** Plan limits alongside real consumption, for the usage page and upgrade prompts. */
billingRouter.get(
  "/usage",
  asyncHandler(async (request, response) => {
    const snapshot = await usageSnapshot(request.tenant!.organizationId, request.tenant!.plan ?? "free");
    response.json({ data: snapshot });
  }),
);
