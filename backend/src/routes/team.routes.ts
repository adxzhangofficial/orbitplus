import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { sha256 } from "../lib/crypto.js";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { planLimits } from "../services/usage.service.js";

export const teamRouter = Router();

teamRouter.get(
  "/members",
  asyncHandler(async (request, response) => {
    const [members, invitations] = await Promise.all([
      pool.query(
        `SELECT m.id AS "membershipId", u.id, u.name, u.email, m.role, m.status,
                u.last_login_at AS "lastLoginAt", m.created_at AS "joinedAt"
           FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1 ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'developer' THEN 3 ELSE 4 END, u.name`,
        [request.tenant!.organizationId],
      ),
      pool.query(
        `SELECT id, email, role, status, expires_at AS "expiresAt", created_at AS "createdAt"
           FROM invitations WHERE organization_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [request.tenant!.organizationId],
      ),
    ]);
    response.json({ data: { members: members.rows, invitations: invitations.rows } });
  }),
);

teamRouter.post(
  "/invitations",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), role: z.enum(["viewer", "developer", "admin"]).default("viewer") }).parse(request.body);
    // Limits come from plan_limits rather than being hardcoded here, so pricing
    // can change without a deploy and an enterprise contract can carry its own
    // values. Pending invitations count against the seat limit.
    const limits = await planLimits(request.tenant!.plan);
    if (limits.maxMembers !== null) {
      const occupied = await pool.query<{ count: number }>(
        `SELECT (
           (SELECT count(*) FROM memberships WHERE organization_id = $1 AND status = 'active')
         + (SELECT count(*) FROM invitations WHERE organization_id = $1 AND status = 'pending')
         )::integer AS count`,
        [request.tenant!.organizationId],
      );
      if ((occupied.rows[0]?.count ?? 0) >= limits.maxMembers) {
        throw new AppError(
          402,
          "PLAN_LIMIT_REACHED",
          `Your ${request.tenant!.plan} plan allows ${limits.maxMembers} team members. Upgrade to invite more.`,
          { resource: "members", limit: limits.maxMembers, plan: request.tenant!.plan },
        );
      }
    }
    const existing = await pool.query(
      `SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND lower(u.email) = $2`,
      [request.tenant!.organizationId, input.email],
    );
    if (existing.rowCount) throw conflict("This user is already a member");
    const token = randomBytes(32).toString("base64url");
    const result = await pool.query(
      `INSERT INTO invitations(organization_id, email, role, token_hash, invited_by)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, email, role, status, expires_at AS "expiresAt", created_at AS "createdAt"`,
      [request.tenant!.organizationId, input.email, input.role, sha256(token), request.auth!.userId],
    );
    response.status(201).json({ data: result.rows[0] });
  }),
);

teamRouter.delete(
  "/invitations/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const result = await pool.query("UPDATE invitations SET status = 'revoked' WHERE id = $1 AND organization_id = $2 AND status = 'pending' RETURNING id", [request.params.id, request.tenant!.organizationId]);
    if (!result.rows[0]) throw notFound("Pending invitation");
    response.status(204).send();
  }),
);

teamRouter.patch(
  "/members/:membershipId",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = z.object({ role: z.enum(["viewer", "developer", "admin"]), status: z.enum(["active", "disabled"]).optional() }).parse(request.body);
    const target = await pool.query<{ role: string; user_id: string }>("SELECT role, user_id FROM memberships WHERE id = $1 AND organization_id = $2", [request.params.membershipId, request.tenant!.organizationId]);
    if (!target.rows[0]) throw notFound("Team member");
    if (target.rows[0].role === "owner") throw badRequest("The organization owner cannot be modified here");
    if (target.rows[0].user_id === request.auth!.userId && input.status === "disabled") throw badRequest("You cannot disable your own membership");
    const result = await pool.query(
      "UPDATE memberships SET role = $3, status = COALESCE($4, status) WHERE id = $1 AND organization_id = $2 RETURNING id AS \"membershipId\", role, status",
      [request.params.membershipId, request.tenant!.organizationId, input.role, input.status ?? null],
    );
    response.json({ data: result.rows[0] });
  }),
);

teamRouter.delete(
  "/members/:membershipId",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const target = await pool.query<{ role: string; user_id: string }>("SELECT role, user_id FROM memberships WHERE id = $1 AND organization_id = $2", [request.params.membershipId, request.tenant!.organizationId]);
    if (!target.rows[0]) throw notFound("Team member");
    if (target.rows[0].role === "owner") throw badRequest("Ownership must be transferred before removing the owner");
    if (target.rows[0].user_id === request.auth!.userId) throw badRequest("You cannot remove your own membership");
    await pool.query("DELETE FROM memberships WHERE id = $1 AND organization_id = $2", [request.params.membershipId, request.tenant!.organizationId]);
    response.status(204).send();
  }),
);
