-- Feature flag fields the admin console already collects.
--
-- The create-flag form asks for an owning team and a change risk, and the flag
-- table shows a staging gate alongside production. None of it was stored, so
-- the console was collecting answers and discarding them. These columns close
-- that gap.
--
-- Only `enabled` gates live traffic (see isFeatureEnabled). `staging_enabled`
-- is the same decision recorded for a non-production deployment, and owner and
-- risk are accountability metadata, not evaluation inputs.

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS staging_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'Platform',
  ADD COLUMN IF NOT EXISTS risk text NOT NULL DEFAULT 'low'
    CHECK (risk IN ('low', 'medium', 'high'));

-- Internal notes on a support ticket.
--
-- Operators need somewhere to write what they would not say to the customer.
-- Giving that its own author role keeps it structurally impossible to render an
-- internal note in a customer-facing thread by mistake, which a boolean column
-- on the same 'operator' role would not.
ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS support_messages_author_role_check;
ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_author_role_check
  CHECK (author_role IN ('customer', 'operator', 'internal'));

-- First-response tracking.
--
-- Attainment cannot be recomputed honestly after the fact once messages are
-- edited or deleted, so the moment an operator first replies is stamped on the
-- ticket when it happens.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

-- Backfill from the messages that already exist. Tickets answered before this
-- migration still get a truthful timestamp.
UPDATE support_tickets t
   SET first_response_at = m.first_reply
  FROM (
    SELECT ticket_id, min(created_at) AS first_reply
      FROM support_messages
     WHERE author_role = 'operator'
     GROUP BY ticket_id
  ) m
 WHERE m.ticket_id = t.id AND t.first_response_at IS NULL;
