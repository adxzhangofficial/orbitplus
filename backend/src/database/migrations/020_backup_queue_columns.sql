-- Columns the backup queue path has always written and never had.
--
-- Backups ran inline in the HTTP request, so the worker and the automation
-- scheduler were never exercised against a real database. Both wrote columns
-- that do not exist: the worker sets started_at, error_message, and
-- last_restored_at, and the automation scheduler inserts type and root_path
-- against a table whose column is called path. A scheduled backup therefore
-- failed at the INSERT, and nothing surfaced it because no test reached that
-- code and the interactive path never used it.
--
-- Adding the columns rather than rewriting the worker: a failure reason and a
-- start time are worth having, and last_restored_at answers "has this snapshot
-- ever been proven to restore", which the metadata blob was standing in for.

ALTER TABLE backups
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS last_restored_at timestamptz,
  -- Distinguishes a snapshot of a whole root from one of a chosen subtree.
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'full'
    CHECK (type IN ('full', 'partial'));

-- 'scheduled' is what an automation-created backup sits in before a worker
-- claims it, and the claim in runBackup already expects to find it.
ALTER TABLE backups DROP CONSTRAINT IF EXISTS backups_status_check;
ALTER TABLE backups
  ADD CONSTRAINT backups_status_check
  CHECK (status IN ('queued', 'scheduled', 'running', 'completed', 'failed', 'restoring'));

-- The workers refer to this as root_path while the interactive route uses
-- path. One name, so the two paths cannot diverge again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'backups' AND column_name = 'path'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'backups' AND column_name = 'root_path'
  ) THEN
    ALTER TABLE backups RENAME COLUMN path TO root_path;
  END IF;
END $$;

-- Finding work to claim, which is what the worker does on every poll.
CREATE INDEX IF NOT EXISTS backups_pending_idx
  ON backups(status, created_at) WHERE status IN ('queued', 'scheduled');
