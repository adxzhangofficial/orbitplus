-- Terminal sessions and their recordings.
--
-- Running a shell on a customer's production server is the most consequential
-- thing this product does, so every session is attributable and replayable.
-- Output is stored as timed chunks rather than a flat blob so a session can be
-- played back at the speed it actually happened, which is what makes a
-- recording useful as evidence rather than just a transcript.

CREATE TABLE IF NOT EXISTS terminal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'failed')),
  rows integer NOT NULL DEFAULT 24,
  cols integer NOT NULL DEFAULT 80,
  client_ip text,
  error_message text,
  bytes_out bigint NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS terminal_sessions_lookup_idx
  ON terminal_sessions(organization_id, server_id, started_at DESC);

CREATE TABLE IF NOT EXISTS terminal_recordings (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  -- Milliseconds since the session began, so playback can reproduce timing.
  offset_ms integer NOT NULL,
  stream text NOT NULL CHECK (stream IN ('input', 'output')),
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terminal_recordings_session_idx
  ON terminal_recordings(session_id, offset_ms);

-- Single-use tickets for the WebSocket handshake.
--
-- A browser cannot set an Authorization header when opening a WebSocket, and
-- putting an access token in the query string would write a live credential
-- into proxy and server logs. The client exchanges its authenticated session
-- for a ticket that is valid once, for a few seconds, for one server.
CREATE TABLE IF NOT EXISTS terminal_tickets (
  token_hash text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terminal_tickets_expiry_idx ON terminal_tickets(expires_at);
