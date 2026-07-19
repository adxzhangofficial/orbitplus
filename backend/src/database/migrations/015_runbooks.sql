-- Runbooks: saved, reviewable command sequences.
--
-- The value over an ad-hoc terminal session is that the steps are written down
-- once, reviewed, and then executed the same way every time, with a record of
-- who ran them and what each step produced.

CREATE TABLE IF NOT EXISTS runbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Ordered steps: [{ name, command, continueOnError }]. Held as JSON because
  -- they are always read and written as a whole sequence, never queried
  -- individually.
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- A runbook that changes production should not be runnable by anyone who can
  -- open the page.
  required_role text NOT NULL DEFAULT 'developer'
    CHECK (required_role IN ('developer', 'admin', 'owner')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runbooks_org_idx ON runbooks(organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS runbook_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runbook_id uuid NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  -- Each step's command, exit code, and output, so a run is auditable after
  -- the fact rather than only observable while it happens.
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS runbook_runs_idx
  ON runbook_runs(organization_id, runbook_id, started_at DESC);
