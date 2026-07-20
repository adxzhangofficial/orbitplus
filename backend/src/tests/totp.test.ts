import { describe, expect, it } from "vitest";
import {
  counterFor,
  decodeBase32,
  encodeBase32,
  generateCode,
  generateRecoveryCodes,
  generateSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyCode,
} from "../lib/totp.js";

/**
 * TOTP is implemented here rather than pulled from a package, which is only
 * defensible if it is checked against the specification's own vectors.
 *
 * These are the SHA-1 rows from RFC 6238 Appendix B. The seed there is the
 * ASCII string "12345678901234567890"; the times are seconds since the epoch.
 */

const RFC_SECRET = encodeBase32(Buffer.from("12345678901234567890", "ascii"));

describe("RFC 6238 test vectors", () => {
  it.each([
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_111_111_111, "050471"],
    [1_234_567_890, "005924"],
    [2_000_000_000, "279037"],
    [20_000_000_000, "353130"],
  ])("at %i seconds produces %s", (seconds, expected) => {
    expect(generateCode(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it("handles a counter above 2^32, which 32-bit shifts would truncate", () => {
    // The last vector is past that boundary. Writing the counter as two 32-bit
    // halves is what makes it come out right.
    expect(generateCode(RFC_SECRET, 20_000_000_000 * 1000)).toBe("353130");
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const input of ["", "a", "ab", "abc", "abcd", "abcde", "hello world"]) {
      const bytes = Buffer.from(input, "ascii");
      expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    }
  });

  it("accepts the casing and padding apps actually send", () => {
    const secret = generateSecret();
    expect(decodeBase32(secret.toLowerCase())).toEqual(decodeBase32(secret));
    expect(decodeBase32(`${secret}====`)).toEqual(decodeBase32(secret));
    expect(decodeBase32(secret.replace(/(.{4})/g, "$1 "))).toEqual(decodeBase32(secret));
  });

  it("refuses a character outside the alphabet", () => {
    expect(() => decodeBase32("ABC!")).toThrow();
  });
});

describe("verifyCode", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;

  it("accepts the current code", () => {
    expect(verifyCode(secret, generateCode(secret, now), { atMs: now }).valid).toBe(true);
  });

  it("accepts one step of clock drift either way", () => {
    // A phone whose clock is slightly off, and the common case of typing a code
    // as it rolls over.
    for (const offset of [-30_000, 30_000]) {
      expect(verifyCode(secret, generateCode(secret, now + offset), { atMs: now }).valid).toBe(true);
    }
  });

  it("refuses drift beyond that", () => {
    for (const offset of [-90_000, 90_000]) {
      expect(verifyCode(secret, generateCode(secret, now + offset), { atMs: now }).valid).toBe(false);
    }
  });

  it("refuses a code already used", () => {
    // Without this a code stays valid for its whole window, so anyone who
    // observes one — over a shoulder, in a screenshare, from a phished form —
    // can replay it within thirty seconds.
    const code = generateCode(secret, now);
    const first = verifyCode(secret, code, { atMs: now });
    expect(first.valid).toBe(true);

    const replay = verifyCode(secret, code, { atMs: now, lastUsedCounter: first.counter });
    expect(replay.valid).toBe(false);
  });

  it("still accepts the next code after one was consumed", () => {
    const used = counterFor(now);
    const next = generateCode(secret, now + 30_000);
    expect(verifyCode(secret, next, { atMs: now + 30_000, lastUsedCounter: used }).valid).toBe(true);
  });

  it("refuses anything that is not six digits", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56 78", "٠١٢٣٤٥"]) {
      expect(verifyCode(secret, bad, { atMs: now }).valid).toBe(false);
    }
  });

  it("tolerates spacing in a pasted code", () => {
    const code = generateCode(secret, now);
    expect(verifyCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { atMs: now }).valid).toBe(true);
  });

  it("refuses a code from a different secret", () => {
    expect(verifyCode(secret, generateCode(generateSecret(), now), { atMs: now }).valid).toBe(false);
  });
});

describe("otpauthUri", () => {
  it("carries what an authenticator needs to scan", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "maya@acme.com");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Orbit%2B");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("escapes an account that would otherwise break the label", () => {
    expect(otpauthUri("JBSWY3DPEHPK3PXP", "a b/c@acme.com")).not.toContain(" ");
  });
});

describe("recovery codes", () => {
  it("issues distinct codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("omits characters that are misread when copied by hand", () => {
    // No I, O, 0, or 1: these are for someone reading off a printout.
    for (const code of generateRecoveryCodes(40)) {
      expect(normalizeRecoveryCode(code)).not.toMatch(/[IO01]/);
    }
  });

  it("normalises what someone actually types", () => {
    const code = generateRecoveryCodes(1)[0]!;
    for (const variant of [code.toLowerCase(), code.replace("-", ""), ` ${code} `]) {
      expect(normalizeRecoveryCode(variant)).toBe(normalizeRecoveryCode(code));
    }
  });
});
