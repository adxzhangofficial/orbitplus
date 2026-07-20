import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords, RFC 6238.
 *
 * Implemented here rather than pulled from a package. It is forty lines of
 * HMAC, it is fully specified, and it has published test vectors — and this is
 * the check standing between a stolen password and someone's production SSH
 * credentials. A dependency in that position is a supply-chain risk with very
 * little to show for it.
 *
 * SHA-1 with six digits and a thirty-second step, because that is what every
 * authenticator app implements. The construction's security does not rest on
 * SHA-1's collision resistance, so its weaknesses elsewhere do not apply.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;

/** RFC 4648 base32, which is what otpauth:// URIs carry. */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Buffer {
  // Padding and casing vary between apps; neither carries meaning.
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of cleaned) {
    const index = BASE32.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 character in the secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 20 bytes, the size RFC 4226 specifies for an HMAC-SHA1 key. */
export function generateSecret(): string {
  return encodeBase32(randomBytes(20));
}

/** The counter for a moment in time. Exposed so replay checks can store it. */
export function counterFor(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / STEP_SECONDS);
}

function codeForCounter(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  // The counter is 64-bit; JavaScript's bitwise operators are 32-bit, so the
  // halves are written separately rather than shifted.
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", secret).update(message).digest();
  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function generateCode(secretBase32: string, atMs: number = Date.now()): string {
  return codeForCounter(decodeBase32(secretBase32), counterFor(atMs));
}

export interface VerifyResult {
  valid: boolean;
  /** Which step matched, so the caller can refuse to accept it twice. */
  counter: number | null;
}

/**
 * Checks a submitted code.
 *
 * One step either side is accepted, which covers a phone whose clock has
 * drifted and the common case of typing a code as it rolls over. Wider than
 * that starts trading real security for convenience.
 *
 * `lastUsedCounter` is what stops replay. Without it a code remains valid for
 * its whole window, so anyone who observes one — over a shoulder, in a
 * screenshare, from a phished form — can use it again within thirty seconds.
 */
export function verifyCode(
  secretBase32: string,
  submitted: string,
  options: { atMs?: number; window?: number; lastUsedCounter?: number | null } = {},
): VerifyResult {
  const cleaned = submitted.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return { valid: false, counter: null };

  const secret = decodeBase32(secretBase32);
  const current = counterFor(options.atMs ?? Date.now());
  const window = options.window ?? 1;

  for (let drift = -window; drift <= window; drift += 1) {
    const counter = current + drift;
    if (options.lastUsedCounter != null && counter <= options.lastUsedCounter) continue;

    const expected = Buffer.from(codeForCounter(secret, counter));
    const actual = Buffer.from(cleaned);
    // Constant-time, so the comparison does not leak how much of the code was
    // right through its timing.
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      return { valid: true, counter };
    }
  }
  return { valid: false, counter: null };
}

/**
 * The otpauth:// URI an authenticator app scans.
 *
 * The issuer appears both as a path prefix and a parameter because apps differ
 * in which they read, and one that reads neither shows the account with no
 * indication of what it belongs to.
 */
export function otpauthUri(secretBase32: string, account: string, issuer = "Orbit+"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const parameters = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}

/**
 * Recovery codes, for a lost phone.
 *
 * Grouped with a dash purely so they can be read aloud and typed accurately;
 * the dash is stripped before hashing so it never affects a comparison.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1.
  return Array.from({ length: count }, () => {
    const raw = Array.from(randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
