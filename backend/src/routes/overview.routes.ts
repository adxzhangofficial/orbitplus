import { Router } from "express";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const overviewRouter = Router();

overviewRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const organizationId = request.tenant!.organizationId;
    const [counts, transferStats, serverHealth, recentActivity, recentDeployments] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT count(*)::integer FROM workspaces WHERE organization_id = $1) AS workspaces,
           (SELECT count(*)::integer FROM server_connections WHERE organization_id = $1) AS servers,
           (SELECT count(*)::integer FROM memberships WHERE organization_id = $1 AND status = 'active') AS members,
           (SELECT count(*)::integer FROM backups WHERE organization_id = $1 AND status = 'completed') AS backups,
           (SELECT count(*)::integer FROM automations WHERE organization_id = $1 AND enabled) AS automations,
           (SELECT count(*)::integer FROM alerts WHERE organization_id = $1 AND status = 'open') AS "openAlerts"`,
        [organizationId],
      ),
      pool.query(
        `SELECT count(*)::integer AS total,
                count(*) FILTER (WHERE status = 'completed')::integer AS completed,
                count(*) FILTER (WHERE status = 'failed')::integer AS failed,
                COALESCE(sum(bytes_transferred), 0) AS "bytesTransferred"
           FROM transfers WHERE organization_id = $1 AND created_at >= now() - interval '30 days'`,
        [organizationId],
      ),
      pool.query(
        `SELECT status, count(*)::integer AS count FROM server_connections
          WHERE organization_id = $1 GROUP BY status`,
        [organizationId],
      ),
      pool.query(
        `SELECT a.id, a.action, a.resource_type AS "resourceType", a.resource_id AS "resourceId",
                a.created_at AS "createdAt", u.name AS actor
           FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.organization_id = $1 ORDER BY a.created_at DESC LIMIT 8`,
        [organizationId],
      ),
      pool.query(
        `SELECT id, name, environment, version, status, created_at AS "createdAt"
           FROM deployments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [organizationId],
      ),
    ]);
    response.json({
      data: {
        organization: { id: organizationId, name: request.tenant!.organizationName, role: request.tenant!.role },
        counts: counts.rows[0],
        transfers: transferStats.rows[0],
        serverHealth: serverHealth.rows,
        recentActivity: recentActivity.rows,
        recentDeployments: recentDeployments.rows,
      },
    });
  }),
);
