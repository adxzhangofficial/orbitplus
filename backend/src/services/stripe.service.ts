import Stripe from "stripe";
import { appUrl, env } from "../config/env.js";
import { pool } from "../database/pool.js";
import { AppError, badRequest } from "../lib/errors.js";

/**
 * Stripe integration.
 *
 * The client is created lazily so the application boots, tests run, and the
 * self-hosted path works with no Stripe account configured. Every billing route
 * checks isStripeConfigured() and reports a clear 503 rather than failing deep
 * inside the SDK.
 */

let client: Stripe | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, "BILLING_NOT_CONFIGURED", "Payments are not configured on this deployment");
  }
  // Pinned to the version this SDK was built against. Bumping it is a
  // deliberate migration, not something to leave floating.
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia" });
  return client;
}

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  get pro() { return env.STRIPE_PRICE_PRO; },
};

/** Reuses the stored customer so repeat checkouts do not fragment billing history. */
export async function ensureCustomer(organizationId: string): Promise<string> {
  const found = await pool.query<{ stripe_customer_id: string | null; name: string; slug: string }>(
    "SELECT stripe_customer_id, name, slug FROM organizations WHERE id = $1",
    [organizationId],
  );
  const organization = found.rows[0];
  if (!organization) throw badRequest("Unknown organization");
  if (organization.stripe_customer_id) return organization.stripe_customer_id;

  const owner = await pool.query<{ email: string; name: string }>(
    `SELECT u.email, u.name FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND m.role = 'owner' AND m.status = 'active'
      ORDER BY m.created_at LIMIT 1`,
    [organizationId],
  );

  const customer = await stripe().customers.create({
    name: organization.name,
    ...(owner.rows[0]?.email ? { email: owner.rows[0].email } : {}),
    metadata: { organizationId, slug: organization.slug },
  });

  await pool.query("UPDATE organizations SET stripe_customer_id = $2 WHERE id = $1", [organizationId, customer.id]);
  return customer.id;
}

export async function createCheckoutSession(organizationId: string, plan: string): Promise<string> {
  const price = PRICE_BY_PLAN[plan];
  if (!price) throw badRequest(`The ${plan} plan is not purchasable through checkout`);
  const customer = await ensureCustomer(organizationId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/workspace/billing?checkout=success`,
    cancel_url: `${appUrl}/workspace/billing?checkout=cancelled`,
    // Echoed back on the webhook so the subscription can be attributed without
    // trusting anything the browser sends on return.
    subscription_data: { metadata: { organizationId } },
    metadata: { organizationId, plan },
  });
  if (!session.url) throw new AppError(502, "CHECKOUT_FAILED", "Stripe did not return a checkout URL");
  return session.url;
}

/** Stripe-hosted portal for card changes, cancellation, and invoice history. */
export async function createPortalSession(organizationId: string): Promise<string> {
  const customer = await ensureCustomer(organizationId);
  const session = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${appUrl}/workspace/billing`,
  });
  return session.url;
}

export function verifyWebhook(payload: Buffer, signature: string | undefined): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "BILLING_NOT_CONFIGURED", "Webhooks are not configured on this deployment");
  }
  if (!signature) throw badRequest("Missing Stripe signature");
  try {
    // Verified against the raw body. Any reserialization would change the bytes
    // and invalidate the signature, which is why the route uses express.raw.
    return stripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    throw badRequest(`Stripe signature verification failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

function planFromEvent(subscription: Stripe.Subscription): string {
  const priceId = subscription.items.data[0]?.price.id;
  if (priceId && priceId === env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

function periodDates(subscription: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const item = subscription.items.data[0];
  return {
    start: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
    end: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
  };
}

/**
 * Applies one event.
 *
 * Providers retry deliveries and can send them out of order or more than once,
 * so the event id is inserted first: a duplicate hits the primary key, the
 * insert reports no rows, and the handler returns without applying it twice.
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<{ applied: boolean; reason?: string }> {
  const claim = await pool.query(
    `INSERT INTO billing_events(id, provider, type, payload)
     VALUES($1, 'stripe', $2, $3::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [event.id, event.type, JSON.stringify({ type: event.type })],
  );
  if (!claim.rowCount) return { applied: false, reason: "duplicate" };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const organizationId = typeof subscription.metadata?.organizationId === "string"
        ? subscription.metadata.organizationId
        : await organizationForCustomer(subscription.customer);
      if (!organizationId) return { applied: false, reason: "unattributed" };

      const cancelled = event.type === "customer.subscription.deleted"
        || subscription.status === "canceled"
        || subscription.status === "incomplete_expired";
      const plan = cancelled ? "free" : planFromEvent(subscription);
      const period = periodDates(subscription);

      await pool.query(
        `UPDATE subscriptions
            SET plan = $2, status = $3, provider = 'stripe', provider_subscription_id = $4,
                provider_price_id = $5, amount_cents = $6,
                current_period_start = COALESCE($7, current_period_start),
                current_period_end = COALESCE($8, current_period_end),
                cancel_at_period_end = $9, updated_at = now()
          WHERE organization_id = $1`,
        [
          organizationId, plan,
          cancelled ? "cancelled" : subscription.status === "trialing" ? "trialing" : "active",
          subscription.id, subscription.items.data[0]?.price.id ?? null,
          subscription.items.data[0]?.price.unit_amount ?? 0,
          period.start, period.end, subscription.cancel_at_period_end ?? false,
        ],
      );
      // The organization's plan drives limit enforcement, so it must move with
      // the subscription rather than being read from Stripe on every check.
      await pool.query("UPDATE organizations SET plan = $2, updated_at = now() WHERE id = $1", [organizationId, plan]);
      await pool.query("UPDATE billing_events SET organization_id = $2 WHERE id = $1", [event.id, organizationId]);
      return { applied: true };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const organizationId = await organizationForCustomer(invoice.customer);
      if (!organizationId) return { applied: false, reason: "unattributed" };
      await pool.query(
        `INSERT INTO invoices(organization_id, invoice_number, amount_cents, currency, status,
                              due_at, paid_at, provider, provider_invoice_id, hosted_invoice_url)
         VALUES($1,$2,$3,$4,$5,$6,$7,'stripe',$8,$9)
         ON CONFLICT (provider, provider_invoice_id) DO UPDATE
            SET status = EXCLUDED.status, paid_at = EXCLUDED.paid_at`,
        [
          organizationId,
          invoice.number ?? invoice.id,
          invoice.amount_due ?? 0,
          (invoice.currency ?? "usd").toUpperCase(),
          event.type === "invoice.paid" ? "paid" : "failed",
          invoice.due_date ? new Date(invoice.due_date * 1000) : null,
          event.type === "invoice.paid" ? new Date() : null,
          invoice.id,
          invoice.hosted_invoice_url ?? null,
        ],
      );
      await pool.query("UPDATE billing_events SET organization_id = $2 WHERE id = $1", [event.id, organizationId]);
      return { applied: true };
    }

    default:
      return { applied: false, reason: "ignored" };
  }
}

async function organizationForCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  const id = typeof customer === "string" ? customer : customer?.id;
  if (!id) return null;
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM organizations WHERE stripe_customer_id = $1",
    [id],
  );
  return result.rows[0]?.id ?? null;
}
