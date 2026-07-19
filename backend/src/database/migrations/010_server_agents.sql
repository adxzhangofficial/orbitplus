-- Read-only server agents.
--
-- Every other path has Orbit connecting inward to the customer's server, which
-- fails whenever a firewall, NAT, or filtering proxy sits between them. An
-- agent reverses the direction: it runs on the server and pushes to Orbit over
-- outbound HTTPS, which is almost never blocked. Browsing, search, and metrics
-- then keep working even when Orbit cannot reach the host at all.
--
-- The agent only ever sends. It accepts no commands and exposes no listening
-- port, so enrolling one grants Orbit no ability to act on the machine. Writes
-- still go over SFTP, which is the deliberate boundary: a compromise of Orbit
-- cannot turn an agent into remote execution.

CREATE TABLE IF NOT EXISTS server_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,

  -- Shown once at enrolment and exchanged for a token. Stored as a hash so a
  -- database disclosure cannot be used to enrol an impostor agent.
  enrollment_token_hash text,
  enrollment_expires_at timestamptz,

  -- The long-lived credential the agent presents on every report, also hashed.
  agent_token_hash text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'stale', 'revoked')),

  hostname text,
  platform text,
  agent_version text,
  last_seen_at timestamptz,
  last_report_at timestamptz,
  report_interval_seconds integer NOT NULL DEFAULT 60,
  reports_received bigint NOT NULL DEFAULT 0,
  last_error text,

  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (server_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS server_agents_token_idx
  ON server_agents(agent_token_hash) WHERE agent_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS server_agents_enrollment_idx
  ON server_agents(enrollment_token_hash) WHERE enrollment_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS server_agents_tenant_idx
  ON server_agents(organization_id, status);

-- Host metrics pushed by the agent. cpu_percent, memory_percent, and
-- disk_percent on `monitors` were never populated because SFTP cannot read
-- them; an agent reads /proc and df directly.
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'probe'
    CHECK (source IN ('probe', 'agent'));

-- Records where a directory listing came from, so the interface can say
-- whether it is showing agent data and how old it is.
ALTER TABLE remote_index_runs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ssh'
    CHECK (source IN ('ssh', 'agent'));
