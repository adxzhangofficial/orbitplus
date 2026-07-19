-- Execution history for automations.
--
-- Running an automation previously only stamped last_run_at and returned
-- "accepted"; nothing executed and no outcome was recorded. Runs are now real
-- rows so a failure is visible and attributable.

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  triggered_by text NOT NULL DEFAULT 'schedule'
    CHECK (triggered_by IN ('schedule', 'manual', 'webhook', 'event')),
  triggered_by_user uuid REFERENCES users(id) ON DELETE SET NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_lookup_idx
  ON automation_runs(organization_id, automation_id, created_at DESC);

-- The scheduler sweeps for due automations every minute, so this predicate
-- must be indexed rather than scanned.
CREATE INDEX IF NOT EXISTS automations_due_idx
  ON automations(next_run_at) WHERE enabled = true AND trigger_type = 'schedule';
