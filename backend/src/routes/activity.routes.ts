import { Router } from "express";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { pagination, pageMeta } from "../lib/pagination.js";

export const activityRouter = Router();

activityRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const action = typeof request.query.action === "string" ? request.query.action : "";
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT a.id, a.action, a.resource_type AS "resourceType", a.resource_id AS "resourceId",
                a.request_id AS "requestId", a.ip_address AS "ipAddress", a.metadata,
                a.created_at AS "createdAt", u.name AS actor, u.email AS "actorEmail"
           FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.organization_id = $1 AND ($2 = '' OR a.action = $2)
          ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`,
        [request.tenant!.organizationId, action, limit, offset],
      ),
      pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM audit_events WHERE organization_id = $1 AND ($2 = '' OR action = $2)", [request.tenant!.organizationId, action]),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);
