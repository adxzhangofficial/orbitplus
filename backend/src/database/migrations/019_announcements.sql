-- Customer announcements.
--
-- The admin console offered a composer, an audience selector, and view and
-- click figures, none of which were stored or sent anywhere. These tables are
-- what it writes to.

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  -- Who it reaches, by plan. Kept as an explicit list rather than a free-text
  -- label so the reachable audience can actually be computed.
  audience text NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'free', 'pro', 'enterprise', 'paid')),
  -- In-app is always on: it is the only channel that cannot fail to a bounce or
  -- a suppression. Email is opt-out per person.
  send_email boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  -- Optional call to action shown under the message.
  action_label text,
  action_url text,
  publish_at timestamptz,
  published_at timestamptz,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_status_idx ON announcements(status, publish_at);

-- One row per person per announcement.
--
-- Views and clicks are counted from real rows rather than incremented
-- counters, so "unique views" means what it says and a reload cannot inflate
-- it. The primary key is what enforces that.
CREATE TABLE IF NOT EXISTS announcement_receipts (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  dismissed_at timestamptz,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS announcement_receipts_user_idx ON announcement_receipts(user_id);

-- Email delivery outcome, so a broadcast that half-failed is visible as such
-- rather than reported as sent.
CREATE TABLE IF NOT EXISTS announcement_deliveries (
  id bigserial PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcement_deliveries_idx
  ON announcement_deliveries(announcement_id, status);

-- Opting out of announcement email. Transactional mail — password resets,
-- security notices — is not covered by this and must not be.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS announcement_email_opt_out boolean NOT NULL DEFAULT false;
