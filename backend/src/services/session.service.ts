import type { Request } from "express";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { pool } from "../database/pool.js";
import { unauthorized } from "../lib/errors.js";
import { generateToken, hashToken } from "../lib/tokens.js";

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

function requestOrigin(request: Request): { userAgent: string | null; ip: string | null } {
  return {
    userAgent: request.header("user-agent")?.slice(0, 400) ?? null,
    ip: request.ip ?? null,
  };
}

function expiryDate(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

/** Issues the first refresh token of a new login, starting a rotation family. */
export async function createSession(userId: string, request: Request): Promise<string> {
  const token = generateToken();
  const { userAgent, ip } = requestOrigin(request);
  await pool.query(
    `INSERT INTO sessions(user_id, family_id, refresh_token_hash, expires_at, user_agent, ip, last_used_at)
     VALUES($1, gen_random_uuid(), $2, $3, $4, $5, now())`,
    [userId, hashToken(token), expiryDate(), userAgent, ip],
  );
  return token;
}

interface RotationResult {
  userId: string;
  token: string;
}

/**
 * Exchanges a refresh token for a new one.
 *
 * A token that has already been rotated is evidence of theft: the legitimate
 * client holds only the newest token, so replay of an older one means a copy
 * exists elsewhere. The entire family is revoked rather than just the replayed
 * token, which signs out the attacker and the victim together and forces a
 * fresh login.
 */
export async function rotateSession(rawToken: string, request: Request): Promise<RotationResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      id: string;
      user_id: string;
      family_id: string;
      expires_at: Date;
      rotated_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at
         FROM sessions WHERE refresh_token_hash = $1 FOR UPDATE`,
      [hashToken(rawToken)],
    );
    const session = found.rows[0];
    if (!session) {
      await client.query("COMMIT");
      throw unauthorized("Invalid or expired session");
    }

    if (session.rotated_at) {
      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'refresh_token_reuse'
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [session.family_id],
      );
      await client.query("COMMIT");
      console.warn("Refresh token reuse detected; session family revoked", {
        userId: session.user_id,
        familyId: session.family_id,
      });
      throw unauthorized("This session was ended for security reasons. Sign in again.");
    }

    if (session.revoked_at || session.expires_at.getTime() <= Date.now()) {
      await client.query("COMMIT");
      throw unauthorized("Invalid or expired session");
    }

    const token = generateToken();
    const { userAgent, ip } = requestOrigin(request);
    await client.query("UPDATE sessions SET rotated_at = now() WHERE id = $1", [session.id]);
    await client.query(
      `INSERT INTO sessions(user_id, family_id, refresh_token_hash, expires_at, user_agent, ip, last_used_at)
       VALUES($1, $2, $3, $4, $5, $6, now())`,
      [session.user_id, session.family_id, hashToken(token), expiryDate(), userAgent, ip],
    );
    await client.query("COMMIT");
    return { userId: session.user_id, token };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Ends one login by revoking every token in its family. */
export async function revokeSession(rawToken: string): Promise<void> {
  await pool.query(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = 'signed_out'
      WHERE family_id = (SELECT family_id FROM sessions WHERE refresh_token_hash = $1)
        AND revoked_at IS NULL`,
    [hashToken(rawToken)],
  );
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = 'revoked_by_user'
      WHERE family_id = (SELECT family_id FROM sessions WHERE id = $1 AND user_id = $2)
        AND revoked_at IS NULL`,
    [sessionId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Used after a password change or reset to sign out everywhere. */
export async function revokeAllSessions(userId: string, reason: string, exceptFamilyOf?: string): Promise<void> {
  const params: unknown[] = [userId, reason];
  let clause = "";
  if (exceptFamilyOf) {
    params.push(hashToken(exceptFamilyOf));
    clause = "AND family_id <> COALESCE((SELECT family_id FROM sessions WHERE refresh_token_hash = $3), '00000000-0000-0000-0000-000000000000'::uuid)";
  }
  await pool.query(
    `UPDATE sessions SET revoked_at = now(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL ${clause}`,
    params,
  );
}

export async function listSessions(userId: string, currentToken?: string): Promise<SessionSummary[]> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const result = await pool.query<{
    id: string;
    user_agent: string | null;
    ip: string | null;
    created_at: Date;
    last_used_at: Date | null;
    expires_at: Date;
    current: boolean;
  }>(
    `SELECT id, user_agent, ip, created_at, last_used_at, expires_at,
            ($2::text IS NOT NULL AND refresh_token_hash = $2) AS current
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND rotated_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [userId, currentHash],
  );
  return result.rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    expiresAt: row.expires_at.toISOString(),
    current: row.current,
  }));
}
