-- Billing identifiers and usage metering.
--
-- Plan changes previously only rewrote a subscriptions row: there was no
-- payment processor, no invoice generation, and no measurement of the resources
-- a plan is supposed to limit.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_customer_idx
  ON organizations(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'none'
    CHECK (provider IN ('none', 'stripe', 'paypal')),
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider_price_id text;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_idx
  ON subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS provider_invoice_id text,
  ADD COLUMN IF NOT EXISTS hosted_invoice_url text;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_provider_idx
  ON invoices(provider, provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;

-- Webhook deliveries are retried by the provider and can arrive out of order or
-- more than once. Recording each event id makes handling idempotent: a repeat
-- delivery hits the primary key and is skipped rather than double-applying.
CREATE TABLE IF NOT EXISTS billing_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  type text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_events_org_idx
  ON billing_events(organization_id, processed_at DESC);

-- Metered usage. Sandbox minutes are the variable cost that free-tier abuse
-- would otherwise consume without limit, so they are recorded per event rather
-- than derived at read time.
CREATE TABLE IF NOT EXISTS usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('sandbox_minutes', 'transfer_bytes', 'storage_bytes', 'api_requests')),
  quantity bigint NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS usage_records_period_idx
  ON usage_records(organization_id, metric, occurred_at DESC);

-- Plan limits live in the database so they can be changed without a deploy and
-- so an enterprise contract can carry its own values.
CREATE TABLE IF NOT EXISTS plan_limits (
  plan text PRIMARY KEY,
  max_servers integer,
  max_members integer,
  max_storage_bytes bigint,
  max_sandbox_minutes integer,
  version_retention_days integer,
  sandbox_internet boolean NOT NULL DEFAULT false,
  requires_payment_verification boolean NOT NULL DEFAULT false
);

INSERT INTO plan_limits (plan, max_servers, max_members, max_storage_bytes, max_sandbox_minutes, version_retention_days, sandbox_internet, requires_payment_verification)
VALUES
  -- Free tier: compute is gated and has no general internet access, because
  -- unrestricted free compute with language runtimes attracts mining.
  ('free',        1,    3,    1073741824,    60,   7,   false, true),
  ('pro',         25,   25,   107374182400,  3000, 90,  true,  false),
  ('enterprise',  NULL, NULL, NULL,          NULL, NULL, true,  false)
ON CONFLICT (plan) DO UPDATE SET
  max_servers = EXCLUDED.max_servers,
  max_members = EXCLUDED.max_members,
  max_storage_bytes = EXCLUDED.max_storage_bytes,
  max_sandbox_minutes = EXCLUDED.max_sandbox_minutes,
  version_retention_days = EXCLUDED.version_retention_days,
  sandbox_internet = EXCLUDED.sandbox_internet,
  requires_payment_verification = EXCLUDED.requires_payment_verification;
