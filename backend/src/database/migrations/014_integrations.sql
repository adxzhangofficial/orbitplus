-- Outbound integrations.
--
-- Alerts, transfers, deployments, and backups all produce events that until now
-- reached nobody outside the interface. A failed nightly backup would sit
-- unread in a notifications list while the person who needed to know was
-- elsewhere.

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('webhook', 'slack', 'discord')),
  name text NOT NULL,
  -- Encrypted at rest: a Slack or Discord webhook URL is a bearer credential.
  -- Anyone holding it can post into the channel.
  target_ciphertext text NOT NULL,
  -- Shown in the interface so an integration is identifiable without exposing
  -- the credential, e.g. "hooks.slack.com/…/T0A1B".
  target_hint text NOT NULL,
  -- Empty means every event. Explicit selection is the common case.
  events text[] NOT NULL DEFAULT '{}',
  -- Signing secret for the webhook kind, so a receiver can verify the payload
  -- came from Orbit rather than from anyone who learned the URL.
  signing_secret_ciphertext text,
  enabled boolean NOT NULL DEFAULT true,
  last_delivery_at timestamptz,
  last_status text,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  delivery_count bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integrations_org_idx ON integrations(organization_id, enabled);

-- Delivery history, so a customer can see what was sent and why something
-- failed rather than guessing at a silent integration.
CREATE TABLE IF NOT EXISTS integration_deliveries (
  id bigserial PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event text NOT NULL,
  status text NOT NULL CHECK (status IN ('delivered', 'failed', 'skipped')),
  response_status integer,
  error_message text,
  duration_ms integer,
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_deliveries_idx
  ON integration_deliveries(integration_id, created_at DESC);
