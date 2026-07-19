-- Authentication lifecycle: verification and reset tokens, refresh-token
-- sessions with rotation, and the columns TOTP enrollment will populate.
--
-- Tokens are stored only as SHA-256 hashes. The raw value exists in the
-- delivered email and in the client, never at rest, so a database disclosure
-- does not yield a usable reset or refresh credential.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('password_reset', 'email_verification')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  requested_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Supports "invalidate every outstanding token of this purpose for this user",
-- which runs on every successful consume and on password change.
CREATE INDEX IF NOT EXISTS auth_tokens_pending_idx
  ON auth_tokens(user_id, purpose) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Every rotation of a login keeps the same family_id. Presenting a token that
  -- was already rotated means the token leaked, so the whole family is revoked.
  family_id uuid NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  user_agent text,
  ip text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions(user_id) WHERE revoked_at IS NULL AND rotated_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_family_idx ON sessions(family_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx
  ON mfa_recovery_codes(user_id) WHERE consumed_at IS NULL;
