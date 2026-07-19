import { pool } from "../database/pool.js";
import { sendAnnouncementEmail } from "./email.service.js";

/**
 * Customer announcements.
 *
 * The in-app channel is always on and cannot fail: it is a query against rows
 * that already exist. Email is a separate, best-effort delivery whose outcome
 * is recorded per recipient, so a broadcast that half-failed reads as half
 * failed rather than as sent.
 *
 * Reach is computed from the audience rule, never stored. A count captured at
 * compose time would be wrong by the time the message published.
 */

export type Audience = "all" | "free" | "pro" | "enterprise" | "paid";

/**
 * SQL fragment matching the plans an audience covers.
 *
 * Written as a comparison rather than string interpolation of plan names, so a
 * new plan does not silently fall out of "all".
 */
function audiencePredicate(audience: Audience): string {
  switch (audience) {
    case "free": return "o.plan = 'free'";
    case "pro": return "o.plan = 'pro'";
    case "enterprise": return "o.plan = 'enterprise'";
    case "paid": return "o.plan <> 'free'";
    default: return "true";
  }
}

export interface Recipient {
  userId: string;
  email: string;
  name: string;
}

/**
 * Everyone an announcement reaches in-app.
 *
 * Distinct because a person can belong to several organizations; being in two
 * matching workspaces should not mean two copies of the same notice.
 */
export async function audienceMembers(audience: Audience): Promise<Recipient[]> {
  const result = await pool.query<Recipient>(
    `SELECT DISTINCT u.id AS "userId", u.email, u.name
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       JOIN organizations o ON o.id = m.organization_id
      WHERE u.active = true AND ${audiencePredicate(audience)}`,
  );
  return result.rows;
}

/** Those of them who have not opted out of announcement email. */
export async function emailRecipients(audience: Audience): Promise<Recipient[]> {
  const result = await pool.query<Recipient>(
    `SELECT DISTINCT u.id AS "userId", u.email, u.name
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       JOIN organizations o ON o.id = m.organization_id
      WHERE u.active = true
        AND u.announcement_email_opt_out = false
        AND ${audiencePredicate(audience)}`,
  );
  return result.rows;
}

export interface Reach {
  inApp: number;
  email: number;
  optedOut: number;
}

export async function reachFor(audience: Audience): Promise<Reach> {
  const result = await pool.query<{ total: number; reachable: number }>(
    `SELECT count(DISTINCT u.id)::integer AS total,
            count(DISTINCT u.id) FILTER (WHERE u.announcement_email_opt_out = false)::integer AS reachable
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       JOIN organizations o ON o.id = m.organization_id
      WHERE u.active = true AND ${audiencePredicate(audience)}`,
  );
  const row = result.rows[0] ?? { total: 0, reachable: 0 };
  return { inApp: row.total, email: row.reachable, optedOut: row.total - row.reachable };
}

/**
 * Sends the email channel for a published announcement.
 *
 * Delivered in small batches with a pause between them. A few thousand
 * recipients at once would trip the provider's rate limit and the tail of the
 * list would silently never arrive; pacing means the whole audience is reached
 * even though it takes longer.
 */
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 1_000;

export async function deliverEmails(announcementId: string): Promise<{ sent: number; failed: number }> {
  const found = await pool.query<{
    title: string; body: string; audience: Audience;
    action_label: string | null; action_url: string | null;
  }>(
    "SELECT title, body, audience, action_label, action_url FROM announcements WHERE id = $1",
    [announcementId],
  );
  const announcement = found.rows[0];
  if (!announcement) return { sent: 0, failed: 0 };

  const recipients = await emailRecipients(announcement.audience);
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
    const batch = recipients.slice(index, index + BATCH_SIZE);
    const outcomes = await Promise.all(batch.map(async (recipient) => {
      try {
        await sendAnnouncementEmail({
          to: recipient.email,
          title: announcement.title,
          body: announcement.body,
          actionLabel: announcement.action_label,
          actionUrl: announcement.action_url,
        });
        return { recipient, status: "sent" as const, error: null };
      } catch (error) {
        return {
          recipient,
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));

    for (const outcome of outcomes) {
      if (outcome.status === "sent") sent += 1; else failed += 1;
    }

    await pool.query(
      `INSERT INTO announcement_deliveries(announcement_id, user_id, email, status, error)
       SELECT $1, x.user_id::uuid, x.email, x.status, x.error
         FROM jsonb_to_recordset($2::jsonb)
              AS x(user_id text, email text, status text, error text)`,
      [
        announcementId,
        JSON.stringify(outcomes.map((outcome) => ({
          user_id: outcome.recipient.userId,
          email: outcome.recipient.email,
          status: outcome.status,
          error: outcome.error,
        }))),
      ],
    );

    if (index + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  return { sent, failed };
}

/** Whether a published announcement asked for the email channel. */
export async function announcementWantsEmail(id: string): Promise<boolean> {
  const result = await pool.query<{ send_email: boolean }>(
    "SELECT send_email FROM announcements WHERE id = $1",
    [id],
  );
  return result.rows[0]?.send_email ?? false;
}

/**
 * Publishes announcements whose scheduled time has arrived.
 *
 * Called by the maintenance sweep. The status update is conditional on the row
 * still being scheduled, so two workers running the sweep at once cannot both
 * publish — and therefore cannot both send the email.
 */
export async function publishDueAnnouncements(): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `UPDATE announcements
        SET status = 'published', published_at = now(), updated_at = now()
      WHERE status = 'scheduled' AND publish_at <= now()
      RETURNING id`,
  );
  return result.rows.map((row) => row.id);
}
