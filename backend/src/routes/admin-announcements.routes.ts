import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { conflict, notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { recordPlatformAction } from "../services/platform-audit.service.js";

/**
 * Customer announcements, from the platform side.
 *
 * In-app delivery is a query against rows that already exist, so it cannot
 * fail. Email is a separate best-effort channel whose per-recipient outcome is
 * recorded, so a broadcast that half-failed reads as half failed.
 */

export const adminAnnouncementsRouter = Router();

const AUDIENCES = ["all", "free", "pro", "enterprise", "paid"] as const;

/**
 * A call-to-action URL ends up in an href in a customer's mail client and
 * browser, so the scheme is constrained here rather than trusted because an
 * operator typed it. Encoding alone would not stop a javascript: link.
 */
const actionUrlSchema = z.string().trim().url().refine(
  (value) => ["http:", "https:"].includes(new URL(value).protocol),
  "Only http and https links are allowed",
);

const announcementInput = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(10_000),
  audience: z.enum(AUDIENCES).default("all"),
  sendEmail: z.boolean().default(false),
  actionLabel: z.string().trim().max(60).nullish(),
  actionUrl: actionUrlSchema.nullish(),
  publishAt: z.string().datetime().nullish(),
});

/** Figures come from receipt rows, so a reload cannot inflate a view count. */
const COLUMNS = `
  a.id, a.title, a.body, a.audience, a.send_email AS "sendEmail", a.status,
  a.action_label AS "actionLabel", a.action_url AS "actionUrl",
  a.publish_at AS "publishAt", a.published_at AS "publishedAt",
  a.created_at AS "createdAt", a.updated_at AS "updatedAt",
  u.name AS "authorName",
  (SELECT count(*)::integer FROM announcement_receipts r WHERE r.announcement_id = a.id) AS views,
  (SELECT count(*)::integer FROM announcement_receipts r
    WHERE r.announcement_id = a.id AND r.clicked_at IS NOT NULL) AS clicks,
  (SELECT count(*)::integer FROM announcement_deliveries d
    WHERE d.announcement_id = a.id AND d.status = 'sent') AS "emailsSent",
  (SELECT count(*)::integer FROM announcement_deliveries d
    WHERE d.announcement_id = a.id AND d.status = 'failed') AS "emailsFailed"`;

adminAnnouncementsRouter.get(
  "/announcements",
  asyncHandler(async (_request, response) => {
    const result = await pool.query(
      `SELECT ${COLUMNS}
         FROM announcements a LEFT JOIN users u ON u.id = a.author_id
        ORDER BY a.created_at DESC LIMIT 200`,
    );
    response.json({ data: result.rows });
  }),
);

/** How many people an audience reaches, computed now rather than stored. */
adminAnnouncementsRouter.get(
  "/announcements/reach",
  asyncHandler(async (request, response) => {
    const audience = z.enum(AUDIENCES).catch("all").parse(request.query.audience);
    const { reachFor } = await import("../services/announcement.service.js");
    response.json({ data: await reachFor(audience) });
  }),
);

/** Delivery outcome per channel, including who could not be reached. */
adminAnnouncementsRouter.get(
  "/announcements/:id/delivery",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    const [summary, failures] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT count(*)::integer FROM announcement_receipts WHERE announcement_id = $1) AS views,
           (SELECT count(*)::integer FROM announcement_receipts
             WHERE announcement_id = $1 AND clicked_at IS NOT NULL) AS clicks,
           (SELECT count(*)::integer FROM announcement_deliveries
             WHERE announcement_id = $1 AND status = 'sent') AS "emailsSent",
           (SELECT count(*)::integer FROM announcement_deliveries
             WHERE announcement_id = $1 AND status = 'failed') AS "emailsFailed"`,
        [id],
      ),
      pool.query(
        `SELECT email, error, created_at AS "createdAt"
           FROM announcement_deliveries
          WHERE announcement_id = $1 AND status = 'failed'
          ORDER BY created_at DESC LIMIT 50`,
        [id],
      ),
    ]);
    response.json({ data: { ...summary.rows[0], failures: failures.rows } });
  }),
);

adminAnnouncementsRouter.post(
  "/announcements",
  asyncHandler(async (request, response) => {
    const input = announcementInput.parse(request.body);
    // A publish time in the past would never be picked up by the sweep, which
    // only looks forward. Treating it as a draft is safer than scheduling
    // something that silently never sends.
    const scheduled = Boolean(input.publishAt && new Date(input.publishAt) > new Date());

    const result = await pool.query<{ id: string; status: string }>(
      `INSERT INTO announcements(title, body, audience, send_email, status, action_label, action_url, publish_at, author_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, status`,
      [input.title, input.body, input.audience, input.sendEmail,
       scheduled ? "scheduled" : "draft",
       input.actionLabel ?? null, input.actionUrl ?? null,
       scheduled ? input.publishAt : null, request.auth!.userId],
    );

    await recordPlatformAction(request, {
      action: "announcement.create", targetType: "announcement", targetId: result.rows[0]!.id,
      metadata: { audience: input.audience, scheduled },
    });
    response.status(201).json({ data: result.rows[0] });
  }),
);

adminAnnouncementsRouter.patch(
  "/announcements/:id",
  asyncHandler(async (request, response) => {
    const input = announcementInput.partial().parse(request.body);
    const id = routeParam(request, "id");

    // The boolean flags distinguish "clear this field" from "leave it alone",
    // which COALESCE alone cannot express for a nullable column.
    const result = await pool.query<{ id: string }>(
      `UPDATE announcements SET
         title = COALESCE($2, title), body = COALESCE($3, body),
         audience = COALESCE($4, audience), send_email = COALESCE($5, send_email),
         action_label = CASE WHEN $6::boolean THEN $7 ELSE action_label END,
         action_url = CASE WHEN $8::boolean THEN $9 ELSE action_url END,
         updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id, input.title ?? null, input.body ?? null, input.audience ?? null,
       input.sendEmail ?? null,
       input.actionLabel !== undefined, input.actionLabel ?? null,
       input.actionUrl !== undefined, input.actionUrl ?? null],
    );
    if (!result.rowCount) throw notFound("Announcement");

    await recordPlatformAction(request, {
      action: "announcement.update", targetType: "announcement", targetId: id, metadata: {},
    });
    response.json({ data: result.rows[0] });
  }),
);

/**
 * Publishes immediately.
 *
 * The status change is conditional on the row not already being published, so
 * two operators pressing this at once cannot both trigger the email. Delivery
 * runs after the response: a broadcast to a few thousand people takes longer
 * than a request should wait, and the delivery table is where its outcome is
 * read.
 */
adminAnnouncementsRouter.post(
  "/announcements/:id/publish",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    const result = await pool.query<{ id: string; send_email: boolean; audience: string }>(
      `UPDATE announcements
          SET status = 'published', published_at = now(), publish_at = NULL, updated_at = now()
        WHERE id = $1 AND status <> 'published'
        RETURNING id, send_email, audience`,
      [id],
    );
    const announcement = result.rows[0];
    if (!announcement) {
      const exists = await pool.query("SELECT 1 FROM announcements WHERE id = $1", [id]);
      if (!exists.rowCount) throw notFound("Announcement");
      throw conflict("This announcement is already published");
    }

    await recordPlatformAction(request, {
      action: "announcement.publish", targetType: "announcement", targetId: id,
      metadata: { audience: announcement.audience, email: announcement.send_email },
    });

    if (announcement.send_email) {
      const { deliverEmails } = await import("../services/announcement.service.js");
      void deliverEmails(id).catch((error: unknown) => {
        console.error("Announcement email delivery failed", { id, error });
      });
    }
    response.json({ data: { published: true, emailQueued: announcement.send_email } });
  }),
);

/**
 * Withdraws a published announcement.
 *
 * In-app it disappears. Email that already left cannot be recalled, and the
 * response reports how much did rather than implying the message was undone.
 */
adminAnnouncementsRouter.post(
  "/announcements/:id/unpublish",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    const sent = await pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM announcement_deliveries
        WHERE announcement_id = $1 AND status = 'sent'`,
      [id],
    );
    const result = await pool.query(
      `UPDATE announcements SET status = 'draft', published_at = NULL, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rowCount) throw notFound("Announcement");

    const emailsAlreadySent = sent.rows[0]?.count ?? 0;
    await recordPlatformAction(request, {
      action: "announcement.unpublish", targetType: "announcement", targetId: id,
      metadata: { emailsAlreadySent },
    });
    response.json({ data: { withdrawn: true, emailsAlreadySent } });
  }),
);

adminAnnouncementsRouter.delete(
  "/announcements/:id",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    const result = await pool.query("DELETE FROM announcements WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) throw notFound("Announcement");
    await recordPlatformAction(request, {
      action: "announcement.delete", targetType: "announcement", targetId: id, metadata: {},
    });
    response.status(204).send();
  }),
);
