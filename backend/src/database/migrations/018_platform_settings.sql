-- Operational state an operator sets, as distinct from feature flags.
--
-- A feature flag answers "should this tenant see this capability". These
-- answer "what is the platform currently doing", which is a different lifetime
-- and a different audience: flags outlive an incident, these are set during one
-- and cleared after.
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
