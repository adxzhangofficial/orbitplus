import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { unauthorized } from "./errors.js";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  platformRole: "user" | "admin";
  type: "access";
}

export function signAccessToken(claims: Omit<AccessTokenClaims, "type">): string {
  return jwt.sign({ ...claims, type: "access" }, env.JWT_SECRET, {
    algorithm: "HS256",
    // Short-lived by design; clients hold a rotating refresh token and call
    // /auth/refresh. Revocation latency is bounded by this value.
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "orbit-api",
    audience: "orbit-workspace",
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "orbit-api",
      audience: "orbit-workspace",
    }) as AccessTokenClaims;
  } catch {
    throw unauthorized("Invalid or expired access token");
  }
}

export interface ChallengeTokenClaims {
  sub: string;
  type: "mfa_challenge";
}

/**
 * Proof that a password was accepted, pending a second factor.
 *
 * Deliberately a distinct token type with a distinct audience, so it cannot be
 * presented anywhere an access token is expected. It carries no role and no
 * email — nothing that would be useful if intercepted — and lives five minutes,
 * which is long enough to open an authenticator and short enough that a
 * captured one is rarely still valid.
 */
export function signChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "mfa_challenge" }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
    issuer: "orbit-api",
    audience: "orbit-mfa-challenge",
  });
}

export function verifyChallengeToken(token: string): ChallengeTokenClaims {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "orbit-api",
      audience: "orbit-mfa-challenge",
    }) as ChallengeTokenClaims;
    // Checked explicitly as well as by audience: a token minted for another
    // purpose with the same secret must never satisfy this.
    if (claims.type !== "mfa_challenge") throw new Error("wrong type");
    return claims;
  } catch {
    throw unauthorized("That sign-in attempt expired. Enter your password again.");
  }
}
