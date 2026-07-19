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
