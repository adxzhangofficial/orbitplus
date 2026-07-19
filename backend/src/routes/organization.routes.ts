import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { conflict, forbidden } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";

/**
 * Workspace identity and governance policy.
 *
 * The policy fields here are enforced elsewhere rather than merely stored:
 * enforce_host_key_pinning and allow_password_auth are read when a server
 * connection is created. A setting the product accepts and then ignores is
 * worse than one it does not offer, because it reads as a control.
 */

const SELECT = `id, name, slug, plan, status, settings,
  default_environment AS "defaultEnvironment", default_root_path AS "defaultRootPath",
  timezone, require_deploy_approval AS "requireDeployApproval",
  enforce_host_key_pinning AS "enforceHostKeyPinning",
  allow_password_auth AS "allowPasswordAuth",
  audit_retention_days AS "auditRetentionDays",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export const organizationRouter = Router();

organizationRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const [organization, counts] = await Promise.all([
      pool.query(`SELECT ${SELECT} FROM organizations WHERE id = $1`, [request.tenant!.organizationId]),
      pool.query<{ members: number; servers: number; workspaces: number }>(
        `SELECT
           (SELECT count(*)::integer FROM memberships WHERE organization_id = $1 AND status = 'active') AS members,
           (SELECT count(*)::integer FROM server_connections WHERE organization_id = $1) AS servers,
           (SELECT count(*)::integer FROM workspaces WHERE organization_id = $1) AS workspaces`,
        [request.tenant!.organizationId],
      ),
    ]);
    response.json({
      data: { ...organization.rows[0], currentUserRole: request.tenant!.role, counts: counts.rows[0] },
    });
  }),
);

organizationRouter.patch(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens").optional(),
      defaultEnvironment: z.enum(["development", "staging", "production"]).optional(),
      defaultRootPath: z.string().trim().startsWith("/").max(2048).optional(),
      timezone: z.string().trim().max(64).optional(),
      requireDeployApproval: z.boolean().optional(),
      enforceHostKeyPinning: z.boolean().optional(),
      allowPasswordAuth: z.boolean().optional(),
      auditRetentionDays: z.number().int().min(30).max(3650).optional(),
      settings: z.object({
        requireBackupBeforeWrite: z.boolean().optional(),
        sessionTimeoutMinutes: z.number().int().min(15).max(43_200).optional(),
      }).strict().optional(),
    }).strict().parse(request.body);

    if (input.slug) {
      const taken = await pool.query(
        "SELECT 1 FROM organizations WHERE slug = $1 AND id <> $2",
        [input.slug, request.tenant!.organizationId],
      );
      if (taken.rowCount) throw conflict("That workspace URL is already taken");
    }

    const result = await pool.query(
      `UPDATE organizations SET
         name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         default_environment = COALESCE($4, default_environment),
         default_root_path = COALESCE($5, default_root_path),
         timezone = COALESCE($6, timezone),
         require_deploy_approval = COALESCE($7, require_deploy_approval),
         enforce_host_key_pinning = COALESCE($8, enforce_host_key_pinning),
         allow_password_auth = COALESCE($9, allow_password_auth),
         audit_retention_days = COALESCE($10, audit_retention_days),
         settings = COALESCE($11::jsonb, settings),
         updated_at = now()
       WHERE id = $1 RETURNING ${SELECT}`,
      [
        request.tenant!.organizationId,
        input.name ?? null, input.slug ?? null,
        input.defaultEnvironment ?? null, input.defaultRootPath ?? null, input.timezone ?? null,
        input.requireDeployApproval ?? null, input.enforceHostKeyPinning ?? null,
        input.allowPasswordAuth ?? null, input.auditRetentionDays ?? null,
        input.settings ? JSON.stringify(input.settings) : null,
      ],
    );
    response.json({ data: result.rows[0] });
  }),
);

/**
 * Transfers ownership.
 *
 * The outgoing owner is demoted to admin in the same transaction, so an
 * organization can never briefly have two owners or none.
 */
organizationRouter.post(
  "/transfer-ownership",
  requireRole("owner"),
  asyncHandler(async (request, response) => {
    const input = z.object({ userId: z.string().uuid() }).parse(request.body);
    if (input.userId === request.auth!.userId) throw conflict("You already own this workspace");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query(
        "SELECT 1 FROM memberships WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
        [request.tenant!.organizationId, input.userId],
      );
      if (!target.rowCount) throw forbidden("That person is not an active member of this workspace");

      await client.query(
        "UPDATE memberships SET role = 'admin' WHERE organization_id = $1 AND user_id = $2",
        [request.tenant!.organizationId, request.auth!.userId],
      );
      await client.query(
        "UPDATE memberships SET role = 'owner' WHERE organization_id = $1 AND user_id = $2",
        [request.tenant!.organizationId, input.userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    response.json({ data: { transferred: true, newOwnerId: input.userId } });
  }),
);
