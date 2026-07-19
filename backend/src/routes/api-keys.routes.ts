import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { hashToken } from "../lib/tokens.js";
import { routeParam } from "../lib/route-param.js";
import { requireRole } from "../middleware/auth.js";

/**
 * Scoped API credentials.
 *
 * Every scope maps to something the API can actually do. Offering a scope the
 * middleware does not enforce would be worse than offering none, because it
 * reads as a guarantee.
 */
export const API_SCOPES = [
  "servers:read", "servers:write",
  "files:read", "files:write",
  "transfers:read", "transfers:write",
  "backups:read", "backups:write",
  "deployments:read", "deployments:write",
  "monitoring:read", "activity:read",
] as const;

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(3650).nullable().default(365),
});

/** Unqualified, for statements with a single table in scope. */
const KEY_COLUMNS = `id, name, prefix, scopes, last_used_at AS "lastUsedAt", last_used_ip AS "lastUsedIp",
  request_count AS "requestCount", expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"`;

/** Qualified, because the list query joins users and `id` and `name` exist on both. */
const JOINED_KEY_COLUMNS = KEY_COLUMNS.replace(/(^|,\s*)(\w+)/g, (_match, lead: string, column: string) => `${lead}k.${column}`);

export const apiKeysRouter = Router();

apiKeysRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT ${JOINED_KEY_COLUMNS}, u.name AS "createdByName"
         FROM api_keys k LEFT JOIN users u ON u.id = k.created_by
        WHERE k.organization_id = $1
        ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`,
      [request.tenant!.organizationId],
    );
    response.json({ data: result.rows, meta: { scopes: API_SCOPES } });
  }),
);

/**
 * Creates a key and returns the secret exactly once.
 *
 * Only the hash is stored, so the plaintext cannot be recovered afterwards by
 * anyone, including an operator with database access.
 */
apiKeysRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = createSchema.parse(request.body);
    // Prefixed so a leaked key is identifiable in logs and by secret scanners.
    const secret = `orb_${randomBytes(24).toString("base64url")}`;
    const expiresAt = input.expiresInDays === null
      ? null
      : new Date(Date.now() + input.expiresInDays * 86_400_000);

    const result = await pool.query(
      `INSERT INTO api_keys(organization_id, name, prefix, key_hash, scopes, created_by, expires_at)
       VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING ${KEY_COLUMNS}`,
      [
        request.tenant!.organizationId, input.name, `${secret.slice(0, 12)}…${secret.slice(-4)}`,
        hashToken(secret), input.scopes, request.auth!.userId, expiresAt,
      ],
    );

    response.status(201).json({
      data: {
        ...result.rows[0],
        // The only time this value exists outside the client's own storage.
        secret,
        warning: "Copy this now. It is stored only as a hash and cannot be shown again.",
      },
    });
  }),
);

/**
 * Revokes rather than deletes.
 *
 * The row is kept so an audit of what a key did still resolves to a name and a
 * creator after the key stops working.
 */
apiKeysRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `UPDATE api_keys SET revoked_at = now(), revoked_by = $3
        WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [routeParam(request, "id"), request.tenant!.organizationId, request.auth!.userId],
    );
    if (!result.rowCount) throw notFound("Active API key");
    response.status(204).send();
  }),
);
