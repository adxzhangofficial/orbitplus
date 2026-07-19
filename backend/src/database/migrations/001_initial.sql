CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  platform_role text NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user', 'admin')),
  active boolean NOT NULL DEFAULT true,
  email_verified boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'suspended', 'cancelled')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'developer', 'admin', 'owner')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'disabled')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id, status);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'developer', 'admin')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_org_idx ON invitations(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS workspaces_org_idx ON workspaces(organization_id);

CREATE TABLE IF NOT EXISTS server_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  host text NOT NULL,
  port integer NOT NULL DEFAULT 22 CHECK (port BETWEEN 1 AND 65535),
  username text NOT NULL,
  root_path text NOT NULL DEFAULT '/',
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
  adapter_mode text NOT NULL DEFAULT 'demo' CHECK (adapter_mode IN ('demo', 'sftp')),
  authentication_type text NOT NULL DEFAULT 'password' CHECK (authentication_type IN ('password', 'privateKey', 'agent')),
  credential_ciphertext text,
  host_fingerprint text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'online', 'offline', 'degraded')),
  last_checked_at timestamptz,
  last_latency_ms integer,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS servers_org_workspace_idx ON server_connections(organization_id, workspace_id);

CREATE TABLE IF NOT EXISTS file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  path text NOT NULL,
  version_number integer NOT NULL,
  content bytea NOT NULL,
  size_bytes bigint NOT NULL,
  checksum text NOT NULL,
  operation text NOT NULL DEFAULT 'write',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, path, version_number)
);
CREATE INDEX IF NOT EXISTS file_versions_lookup_idx ON file_versions(organization_id, server_id, path, version_number DESC);

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid REFERENCES server_connections(id) ON DELETE SET NULL,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('upload', 'download', 'sync')),
  source_path text NOT NULL,
  destination_path text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  bytes_total bigint NOT NULL DEFAULT 0,
  bytes_transferred bigint NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfers_org_idx ON transfers(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid REFERENCES server_connections(id) ON DELETE SET NULL,
  name text NOT NULL,
  path text NOT NULL DEFAULT '/',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'restoring')),
  size_bytes bigint NOT NULL DEFAULT 0,
  file_count integer NOT NULL DEFAULT 0,
  storage_key text,
  retention_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS backups_org_idx ON backups(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  server_id uuid REFERENCES server_connections(id) ON DELETE SET NULL,
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  version text NOT NULL,
  previous_version text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'rolled_back')),
  commit_sha text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS deployments_org_idx ON deployments(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger_type text NOT NULL CHECK (trigger_type IN ('schedule', 'webhook', 'event', 'manual')),
  schedule text,
  action_type text NOT NULL CHECK (action_type IN ('backup', 'deployment', 'sync', 'health_check', 'webhook')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automations_org_idx ON automations(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'warning', 'critical', 'unknown')),
  cpu_percent numeric(5,2),
  memory_percent numeric(5,2),
  disk_percent numeric(5,2),
  latency_ms integer,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  sampled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitors_latest_idx ON monitors(organization_id, server_id, sampled_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid REFERENCES server_connections(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS alerts_org_idx ON alerts(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(organization_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('free', 'pro', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled')),
  interval text NOT NULL DEFAULT 'monthly' CHECK (interval IN ('monthly', 'yearly')),
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void')),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_org_idx ON invoices(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_idx ON audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events(action, created_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users', 'organizations', 'memberships', 'workspaces', 'server_connections', 'transfers', 'automations', 'subscriptions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', table_name, table_name);
  END LOOP;
END $$;
