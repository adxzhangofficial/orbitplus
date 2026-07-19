-- Programmatic API credentials.
--
-- The API keys page generated a key in the browser, showed it once, and stored
-- nothing. The value it displayed authenticated nothing, so anyone who put it
-- in a CI pipeline got 401s from a key the product had told them was live.
--
-- Keys are stored only as a SHA-256 hash. A plain hash rather than bcrypt is
-- correct here: the secret is 256 bits of entropy, so there is no dictionary to
-- attack, and verification has to be a single indexed lookup on every request.

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Shown in the interface so a key is identifiable without revealing it.
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  -- Least privilege: a key carries an explicit list rather than inheriting
  -- whatever its creator could do.
  scopes text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  last_used_ip text,
  request_count bigint NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id, created_at DESC);
-- The lookup performed on every authenticated API request.
CREATE INDEX IF NOT EXISTS api_keys_active_idx
  ON api_keys(key_hash) WHERE revoked_at IS NULL;
