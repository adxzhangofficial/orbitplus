-- Profile and preference storage.
--
-- The profile and workspace settings pages rendered editable fields, accepted
-- input, and reported "saved" without sending anything anywhere. Reloading
-- restored the old values. These columns are what those forms write to.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'MMM d, yyyy',
  -- Interface choices that are per-person rather than per-organization.
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Defaults applied to new server connections, and the governance rules the
-- workspace enforces. Kept on the organization because they are shared policy,
-- not one member's preference.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_environment text NOT NULL DEFAULT 'production'
    CHECK (default_environment IN ('development', 'staging', 'production')),
  ADD COLUMN IF NOT EXISTS default_root_path text NOT NULL DEFAULT '/',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS require_deploy_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enforce_host_key_pinning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_password_auth boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS audit_retention_days integer NOT NULL DEFAULT 365;
