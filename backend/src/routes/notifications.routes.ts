import { Router } from "express";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const unreadOnly = request.query.unread === "true";
    const result = await pool.query(
      `SELECT id, type, title, message, link, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications
        WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL)
          AND (NOT $3::boolean OR read_at IS NULL)
        ORDER BY created_at DESC LIMIT 100`,
      [request.tenant!.organizationId, request.auth!.userId, unreadOnly],
    );
    const unread = await pool.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM notifications WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read_at IS NULL",
      [request.tenant!.organizationId, request.auth!.userId],
    );
    response.json({ data: result.rows, meta: { unread: unread.rows[0]?.count ?? 0 } });
  }),
);

notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND organization_id = $2 AND (user_id = $3 OR user_id IS NULL)
        RETURNING id, read_at AS "readAt"`,
      [request.params.id, request.tenant!.organizationId, request.auth!.userId],
    );
    if (!result.rows[0]) throw notFound("Notification");
    response.json({ data: result.rows[0] });
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE organization_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read_at IS NULL`,
      [request.tenant!.organizationId, request.auth!.userId],
    );
    response.json({ data: { updated: result.rowCount ?? 0 } });
  }),
);
