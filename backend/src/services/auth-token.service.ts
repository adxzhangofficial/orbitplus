import type { Request } from "express";
import { pool } from "../database/pool.js";
import { generateToken, hashToken } from "../lib/tokens.js";

export type TokenPurpose = "password_reset" | "email_verification";

/**
 * Single-use, expiring tokens for password reset and email verification.
 *
 * Issuing invalidates any outstanding token of the same purpose so a user who
 * clicks "resend" three times cannot leave three live reset links in an inbox.
 */
export async function issueAuthToken(
  userId: string,
  purpose: TokenPurpose,
  ttlMs: number,
  request?: Request,
): Promise<string> {
  const token = generateToken();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE auth_tokens SET consumed_at = now()
        WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [userId, purpose],
    );
    await client.query(
      `INSERT INTO auth_tokens(user_id, purpose, token_hash, expires_at, requested_ip)
       VALUES($1, $2, $3, $4, $5)`,
      [userId, purpose, hashToken(token), new Date(Date.now() + ttlMs), request?.ip ?? null],
    );
    await client.query("COMMIT");
    return token;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Atomically claims a token. The UPDATE ... RETURNING is the guard: two
 * concurrent requests with the same token cannot both match the
 * `consumed_at IS NULL` predicate, so exactly one caller receives the row.
 */
export async function consumeAuthToken(rawToken: string, purpose: TokenPurpose): Promise<string | null> {
  const result = await pool.query<{ user_id: string }>(
    `UPDATE auth_tokens SET consumed_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(rawToken), purpose],
  );
  return result.rows[0]?.user_id ?? null;
}

/** Removes expired and long-consumed rows; called from the maintenance path. */
export async function pruneAuthTokens(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM auth_tokens
      WHERE expires_at < now() - interval '7 days'
         OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '7 days')`,
  );
  return result.rowCount ?? 0;
}
