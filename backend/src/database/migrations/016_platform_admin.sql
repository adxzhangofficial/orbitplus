-- Platform administration.
--
-- The admin dashboard could read but not act: suspending a tenant, disabling a
-- person's access, managing a feature flag, or answering a support ticket were
-- all buttons that reported "not supported by the current API". These tables
-- are what those actions write to.

-- Feature flags evaluated by the application rather than displayed for effect.
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  -- 0 to 100. Assignment is by hash of the organization id, so a tenant either
  -- has a feature or does not; it must not flicker between requests.
  rollout_percent integer NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  -- Overrides that ignore the rollout entirely, for a customer who needs a
  -- feature early or must be kept off it.
  enabled_organizations uuid[] NOT NULL DEFAULT '{}',
  disabled_organizations uuid[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  opened_by uuid REFERENCES users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx
  ON support_tickets(status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id bigserial PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Distinguishes a customer's words from an operator's, so a reply is never
  -- mistaken for something the customer said.
  author_role text NOT NULL CHECK (author_role IN ('customer', 'operator')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
  ON support_messages(ticket_id, created_at);

-- Every platform-admin action, kept separately from tenant audit.
--
-- A platform operator can act on any customer's data, so what they did needs a
-- record the customer's own audit cannot contain and an operator cannot edit
-- through the product.
CREATE TABLE IF NOT EXISTS platform_audit (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_time_idx ON platform_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_target_idx ON platform_audit(target_type, target_id);

-- Suspension needs a reason and an author, because "why is this account
-- disabled" is the first question asked and the row is the only answer.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES users(id) ON DELETE SET NULL;
