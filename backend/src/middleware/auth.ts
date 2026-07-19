import type { RequestHandler } from "express";
import { pool } from "../database/pool.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { asyncHandler } from "../lib/async-handler.js";

export type PlatformRole = "user" | "admin";
export type MembershipRole = "viewer" | "developer" | "admin" | "owner";

const roleRank: Record<MembershipRole, number> = {
  viewer: 1,
  developer: 2,
  admin: 3,
  owner: 4,
};

export const authenticate = asyncHandler(async (request, _response, next) => {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const token = authorization.slice("Bearer ".length).trim();
  const claims = verifyAccessToken(token);
  const result = await pool.query<{
    id: string;
    email: string;
    platform_role: PlatformRole;
    active: boolean;
  }>("SELECT id, email, platform_role, active FROM users WHERE id = $1", [claims.sub]);
  const user = result.rows[0];
  if (!user?.active) throw unauthorized("This account is unavailable");
  request.auth = {
    userId: user.id,
    email: user.email,
    platformRole: user.platform_role,
  };
  next();
});

export const resolveTenant = asyncHandler(async (request, _response, next) => {
  if (!request.auth) throw unauthorized();
  const requestedOrganization = request.header("x-organization-id");
  const params: unknown[] = [request.auth.userId];
  let organizationFilter = "";
  if (requestedOrganization) {
    params.push(requestedOrganization);
    organizationFilter = "AND o.id = $2";
  }
  const result = await pool.query<{
    organization_id: string;
    organization_name: string;
    organization_status: "active" | "trialing" | "suspended" | "cancelled";
    role: MembershipRole;
  }>(
    `SELECT o.id AS organization_id, o.name AS organization_name,
            o.status AS organization_status, m.role
       FROM memberships m
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.status = 'active' ${organizationFilter}
      ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'developer' THEN 3 ELSE 4 END,
               m.created_at
      LIMIT 1`,
    params,
  );
  const membership = result.rows[0];
  if (!membership) throw forbidden("You are not a member of this organization");
  if (membership.organization_status !== "active" && membership.organization_status !== "trialing") {
    throw forbidden("This organization is not active");
  }
  request.tenant = {
    organizationId: membership.organization_id,
    organizationName: membership.organization_name,
    role: membership.role,
  };
  next();
});

export function requireRole(minimumRole: MembershipRole): RequestHandler {
  return (request, _response, next) => {
    if (!request.tenant || roleRank[request.tenant.role] < roleRank[minimumRole]) {
      next(forbidden(`This action requires the ${minimumRole} role or higher`));
      return;
    }
    next();
  };
}

export const requirePlatformAdmin: RequestHandler = (request, _response, next) => {
  if (request.auth?.platformRole !== "admin") {
    next(forbidden("Platform administrator access is required"));
    return;
  }
  next();
};
