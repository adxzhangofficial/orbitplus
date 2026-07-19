import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque credential handling for reset, verification, and refresh tokens.
 *
 * Only the SHA-256 hash is persisted. A plain hash is correct here rather than
 * bcrypt: these are 256-bit random values, so there is no dictionary to attack
 * and no need for a slow KDF, and lookup must stay a single indexed query.
 */

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compares two hex digests without leaking position through timing. */
export function tokenHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recovery codes are shown once at enrollment; groups aid manual entry. */
export function generateRecoveryCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}
