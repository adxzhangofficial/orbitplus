-- Cached remote directory metadata.
--
-- Listing a directory cost one SSH round trip each, so browsing a tree over a
-- link with meaningful latency was unusable: 500 directories at ~1s RTT is 500
-- seconds of waiting. The whole tree is instead walked once with a single
-- command and stored here, so navigation reads from Postgres and is instant.
--
-- Only metadata is cached. File contents are always fetched live, because a
-- stale copy shown in an editor would let someone overwrite a change made
-- outside Orbit without ever seeing it.

CREATE TABLE IF NOT EXISTS remote_entries (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  path text NOT NULL,
  parent_path text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('file', 'directory', 'symlink')),
  size_bytes bigint NOT NULL DEFAULT 0,
  mode text,
  modified_at timestamptz,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, path)
);

-- The only hot query: everything directly inside one directory.
CREATE INDEX IF NOT EXISTS remote_entries_parent_idx
  ON remote_entries(server_id, parent_path, name);
-- Supports name search across a whole server without touching the remote host.
CREATE INDEX IF NOT EXISTS remote_entries_name_idx
  ON remote_entries(server_id, lower(name));
CREATE INDEX IF NOT EXISTS remote_entries_tenant_idx
  ON remote_entries(organization_id, server_id);

-- Per-server index state, so the UI can say whether it is showing a cached
-- tree, how old it is, and whether a walk is currently running.
CREATE TABLE IF NOT EXISTS remote_index_runs (
  server_id uuid PRIMARY KEY REFERENCES server_connections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'ready', 'failed', 'unsupported')),
  entry_count integer NOT NULL DEFAULT 0,
  truncated boolean NOT NULL DEFAULT false,
  duration_ms integer,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
