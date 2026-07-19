import type { RequestHandler } from "express";
import { pool } from "../database/pool.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { asyncHandler } from "../lib/async-handler.js";
import { hashToken } from "../lib/tokens.js";

export type PlatformRole = "user" | "admin";
export type MembershipRole = "viewer" | "developer" | "admin" | "owner";

const roleRank: Record<MembershipRole, number> = {
  viewer: 1,
  developer: 2,
  admin: 3,
  owner: 4,
};

/**
 * Authenticates a request carrying an API key.
 *
 * Keys are recognised by their prefix, so a malformed or expired one produces a
 * clear error rather than being sent to the JWT verifier and reported as an
 * invalid session token.
 */
async function authenticateApiKey(request: Parameters<typeof authenticate>[0], secret: string): Promise<boolean> {
  const result = await pool.query<{
    id: string; organization_id: string; scopes: string[]; expires_at: Date | null; created_by: string | null;
  }>(
    `SELECT id, organization_id, scopes, expires_at, created_by
       FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hashToken(secret)],
  );
  const key = result.rows[0];
  if (!key) throw unauthorized("This API key is invalid or has been revoked");
  if (key.expires_at && key.expires_at.getTime() <= Date.now()) throw unauthorized("This API key has expired");

  // Usage is recorded without blocking the request; losing a counter must not
  // fail an otherwise valid call.
  void pool.query(
    "UPDATE api_keys SET last_used_at = now(), last_used_ip = $2, request_count = request_count + 1 WHERE id = $1",
    [key.id, request.ip ?? null],
  ).catch(() => undefined);

  request.auth = {
    // Attributed to the key's creator so audit records still name a person.
    userId: key.created_by ?? key.id,
    email: `api-key:${key.id}`,
    platformRole: "user",
    apiKeyId: key.id,
    scopes: key.scopes,
  };
  // Bound to the key's own organization: an API key can never reach another
  // tenant regardless of what the request asks for.
  request.apiKeyOrganizationId = key.organization_id;
  return true;
}

export const authenticate = asyncHandler(async (request, _response, next) => {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const token = authorization.slice("Bearer ".length).trim();

  if (token.startsWith("orb_")) {
    await authenticateApiKey(request, token);
    next();
    return;
  }

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

  // An API key belongs to exactly one organization, so it resolves directly
  // rather than through membership. Ignoring X-Organization-Id here is the
  // point: a key must not be redirectable at another tenant by a header.
  if (request.apiKeyOrganizationId) {
    const result = await pool.query<{ id: string; name: string; plan: string; status: string }>(
      "SELECT id, name, plan, status FROM organizations WHERE id = $1",
      [request.apiKeyOrganizationId],
    );
    const organization = result.rows[0];
    if (!organization) throw forbidden("This API key's organization no longer exists");
    if (organization.status !== "active" && organization.status !== "trialing") {
      throw forbidden("This organization is not active");
    }
    request.tenant = {
      organizationId: organization.id,
      organizationName: organization.name,
      plan: organization.plan,
      // Role checks are satisfied by scopes for a key; requireRole is bypassed
      // in favour of requireScope, which is the finer-grained control.
      role: "admin",
    };
    next();
    return;
  }

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
    organization_plan: string;
    role: MembershipRole;
  }>(
    `SELECT o.id AS organization_id, o.name AS organization_name,
            o.status AS organization_status, o.plan AS organization_plan, m.role
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
    plan: membership.organization_plan,
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

/**
 * Requires a scope when the caller used an API key.
 *
 * A user session is unscoped and passes: its authority is already bounded by
 * the member's role. A key carries an explicit list, so this is what makes
 * "read-only key" mean something rather than being a label in the interface.
 */
export function requireScope(scope: string): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) throw unauthorized();
    if (!request.auth.apiKeyId) { next(); return; }
    if (!request.auth.scopes?.includes(scope)) {
      throw forbidden(`This API key does not carry the ${scope} scope`);
    }
    next();
  };
}
