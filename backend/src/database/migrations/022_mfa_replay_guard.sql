-- The last TOTP step this account accepted.
--
-- Without it a code stays valid for its whole window, so anyone who observes
-- one — over a shoulder, in a screenshare, from a phished form — can use it
-- again within thirty seconds. Storing the step that was consumed is what makes
-- a one-time password actually one-time.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_last_counter bigint,
  -- When enrolment completed, so the security page can say since when.
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz;
