import { Router } from "express";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";

/**
 * Announcements as a customer sees them.
 *
 * Visibility follows the audience rule rather than a stored recipient list, so
 * a workspace that upgrades to Pro sees Pro announcements from that moment,
 * and one that downgrades stops. A snapshot taken at publish time would be
 * wrong the first time anyone changed plan.
 */

export const announcementsRouter = Router();

/**
 * Published announcements this person's workspaces qualify for.
 *
 * A person in several matching organizations sees one copy: the DISTINCT is
 * what makes that true.
 */
announcementsRouter.get(
  "/announcements",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT DISTINCT a.id, a.title, a.body, a.action_label AS "actionLabel",
              a.action_url AS "actionUrl", a.published_at AS "publishedAt",
              r.viewed_at AS "viewedAt", r.dismissed_at AS "dismissedAt"
         FROM announcements a
         JOIN memberships m ON m.user_id = $1 AND m.status = 'active'
         JOIN organizations o ON o.id = m.organization_id
         LEFT JOIN announcement_receipts r
           ON r.announcement_id = a.id AND r.user_id = $1
        WHERE a.status = 'published'
          AND (
            a.audience = 'all'
            OR a.audience = o.plan
            OR (a.audience = 'paid' AND o.plan <> 'free')
          )
        ORDER BY a.published_at DESC
        LIMIT 50`,
      [request.auth!.userId],
    );
    response.json({ data: result.rows });
  }),
);

/**
 * Records that this person saw it.
 *
 * One row per person per announcement, so "unique views" means what it says
 * and reopening the page cannot inflate the figure. The first view wins; a
 * later one only updates the click or dismissal.
 */
announcementsRouter.post(
  "/announcements/:id/view",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    const visible = await pool.query(
      `SELECT 1 FROM announcements a
         JOIN memberships m ON m.user_id = $2 AND m.status = 'active'
         JOIN organizations o ON o.id = m.organization_id
        WHERE a.id = $1 AND a.status = 'published'
          AND (a.audience = 'all' OR a.audience = o.plan
               OR (a.audience = 'paid' AND o.plan <> 'free'))
        LIMIT 1`,
      [id, request.auth!.userId],
    );
    if (!visible.rowCount) throw notFound("Announcement");

    await pool.query(
      `INSERT INTO announcement_receipts(announcement_id, user_id)
       VALUES($1, $2) ON CONFLICT DO NOTHING`,
      [id, request.auth!.userId],
    );
    response.status(204).send();
  }),
);

announcementsRouter.post(
  "/announcements/:id/click",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    // A click implies a view, so the receipt is created if it is missing —
    // otherwise a click could be recorded against nothing.
    await pool.query(
      `INSERT INTO announcement_receipts(announcement_id, user_id, clicked_at)
       VALUES($1, $2, now())
       ON CONFLICT (announcement_id, user_id)
       DO UPDATE SET clicked_at = COALESCE(announcement_receipts.clicked_at, now())`,
      [id, request.auth!.userId],
    );
    response.status(204).send();
  }),
);

announcementsRouter.post(
  "/announcements/:id/dismiss",
  asyncHandler(async (request, response) => {
    const id = routeParam(request, "id");
    await pool.query(
      `INSERT INTO announcement_receipts(announcement_id, user_id, dismissed_at)
       VALUES($1, $2, now())
       ON CONFLICT (announcement_id, user_id)
       DO UPDATE SET dismissed_at = now()`,
      [id, request.auth!.userId],
    );
    response.status(204).send();
  }),
);
