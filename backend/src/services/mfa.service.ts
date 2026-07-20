import bcrypt from "bcryptjs";
import { pool } from "../database/pool.js";
import { decryptJson, encryptJson } from "../lib/crypto.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import {
  generateRecoveryCodes,
  generateSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyCode,
} from "../lib/totp.js";

/**
 * Second-factor enrolment and verification.
 *
 * The secret is encrypted at rest with the same key that protects server
 * credentials: a database dump alone must not let someone mint valid codes.
 * Recovery codes are hashed, never stored in a form that can be read back, and
 * consumed exactly once.
 *
 * Enrolment is two steps on purpose. A secret is issued and held as *pending*
 * until a code generated from it is proved; only then does the account require
 * a second factor. Enabling on issue would lock out anyone whose scan silently
 * failed.
 */

interface MfaRow {
  mfa_enabled: boolean;
  mfa_secret_ciphertext: string | null;
  mfa_last_counter: string | null;
}

async function loadUser(userId: string): Promise<MfaRow> {
  const result = await pool.query<MfaRow>(
    "SELECT mfa_enabled, mfa_secret_ciphertext, mfa_last_counter FROM users WHERE id = $1",
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw unauthorized();
  return row;
}

interface StoredSecret {
  secret: string;
  /** Set until a code has been proved; enrolment is not complete before then. */
  pending: boolean;
}

/** Issues a secret and the URI an authenticator scans. Enables nothing yet. */
export async function beginEnrolment(userId: string, email: string): Promise<{ secret: string; otpauthUri: string }> {
  const user = await loadUser(userId);
  if (user.mfa_enabled) throw badRequest("Two-factor authentication is already enabled on this account");

  const secret = generateSecret();
  await pool.query(
    "UPDATE users SET mfa_secret_ciphertext = $2 WHERE id = $1",
    [userId, encryptJson({ secret, pending: true } satisfies StoredSecret)],
  );

  // Returned once. The interface shows it beside the QR code for anyone typing
  // it by hand, and it is never readable again afterwards.
  return { secret, otpauthUri: otpauthUri(secret, email) };
}

/**
 * Completes enrolment by proving a code, and returns the recovery codes.
 *
 * The codes are shown exactly once. Storing them in a readable form would make
 * a database dump equivalent to bypassing the second factor entirely, which
 * defeats the purpose of having one.
 */
export async function completeEnrolment(userId: string, code: string): Promise<string[]> {
  const user = await loadUser(userId);
  if (user.mfa_enabled) throw badRequest("Two-factor authentication is already enabled");
  if (!user.mfa_secret_ciphertext) throw badRequest("Start enrolment before confirming a code");

  const stored = decryptJson<StoredSecret>(user.mfa_secret_ciphertext);
  const result = verifyCode(stored.secret, code);
  if (!result.valid) throw badRequest("That code is not valid. Check your authenticator and try again.");

  const codes = generateRecoveryCodes();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users SET mfa_enabled = true, mfa_enrolled_at = now(),
              mfa_secret_ciphertext = $2, mfa_last_counter = $3
        WHERE id = $1`,
      [userId, encryptJson({ secret: stored.secret, pending: false } satisfies StoredSecret), result.counter],
    );
    // Any codes from a previous enrolment are gone, not merely superseded.
    await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
    for (const recovery of codes) {
      await client.query(
        "INSERT INTO mfa_recovery_codes(user_id, code_hash) VALUES($1, $2)",
        [userId, await bcrypt.hash(normalizeRecoveryCode(recovery), 10)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return codes;
}

export interface ChallengeOutcome {
  ok: boolean;
  /** True when a recovery code was spent rather than a generated one. */
  usedRecoveryCode: boolean;
  remainingRecoveryCodes: number;
}

/**
 * Checks a code at sign-in.
 *
 * Accepts either a generated code or an unused recovery code. A generated code
 * is refused if its step was already consumed, and a recovery code is marked
 * consumed in the same statement that selects it, so two simultaneous attempts
 * cannot both spend the same one.
 */
export async function verifyChallenge(userId: string, submitted: string): Promise<ChallengeOutcome> {
  const user = await loadUser(userId);
  if (!user.mfa_enabled || !user.mfa_secret_ciphertext) {
    throw badRequest("Two-factor authentication is not enabled on this account");
  }

  const stored = decryptJson<StoredSecret>(user.mfa_secret_ciphertext);
  const lastUsed = user.mfa_last_counter === null ? null : Number(user.mfa_last_counter);
  const totp = verifyCode(stored.secret, submitted, { lastUsedCounter: lastUsed });

  if (totp.valid) {
    await pool.query("UPDATE users SET mfa_last_counter = $2 WHERE id = $1", [userId, totp.counter]);
    return { ok: true, usedRecoveryCode: false, remainingRecoveryCodes: await countRecoveryCodes(userId) };
  }

  const normalized = normalizeRecoveryCode(submitted);
  if (normalized.length >= 8) {
    const candidates = await pool.query<{ id: string; code_hash: string }>(
      "SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = $1 AND consumed_at IS NULL",
      [userId],
    );
    for (const candidate of candidates.rows) {
      if (!(await bcrypt.compare(normalized, candidate.code_hash))) continue;
      // Conditional on it still being unconsumed, so two attempts racing each
      // other cannot both succeed on one code.
      const consumed = await pool.query(
        "UPDATE mfa_recovery_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id",
        [candidate.id],
      );
      if (!consumed.rowCount) break;
      return { ok: true, usedRecoveryCode: true, remainingRecoveryCodes: await countRecoveryCodes(userId) };
    }
  }

  return { ok: false, usedRecoveryCode: false, remainingRecoveryCodes: await countRecoveryCodes(userId) };
}

export async function countRecoveryCodes(userId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM mfa_recovery_codes WHERE user_id = $1 AND consumed_at IS NULL",
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

/**
 * Turns the second factor off.
 *
 * Requires the password and a current code. Removing a protection is exactly
 * when to demand proof of both factors: an attacker holding a hijacked session
 * should not be able to strip it and keep the account.
 */
export async function disable(userId: string, password: string, code: string): Promise<void> {
  const result = await pool.query<{ password_hash: string; mfa_enabled: boolean }>(
    "SELECT password_hash, mfa_enabled FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0];
  if (!user) throw unauthorized();
  if (!user.mfa_enabled) throw badRequest("Two-factor authentication is not enabled");
  if (!(await bcrypt.compare(password, user.password_hash))) throw unauthorized("That password is not correct");

  const outcome = await verifyChallenge(userId, code);
  if (!outcome.ok) throw badRequest("That code is not valid");

  await pool.query(
    `UPDATE users SET mfa_enabled = false, mfa_secret_ciphertext = NULL,
            mfa_last_counter = NULL, mfa_enrolled_at = NULL
      WHERE id = $1`,
    [userId],
  );
  await pool.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
}

/** Issues a fresh set, invalidating the old. For someone who used or lost them. */
export async function regenerateRecoveryCodes(userId: string, code: string): Promise<string[]> {
  const outcome = await verifyChallenge(userId, code);
  if (!outcome.ok) throw badRequest("That code is not valid");

  const codes = generateRecoveryCodes();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
    for (const recovery of codes) {
      await client.query(
        "INSERT INTO mfa_recovery_codes(user_id, code_hash) VALUES($1, $2)",
        [userId, await bcrypt.hash(normalizeRecoveryCode(recovery), 10)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return codes;
}
