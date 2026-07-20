import rateLimit, { type Options } from "express-rate-limit";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";

/**
 * Request limits.
 *
 * Only /auth was limited, which protected against password guessing and
 * nothing else. Every other route — listing files, opening connections,
 * queueing backups — was unbounded, so one tenant could saturate the workers
 * and the SFTP connection pool for everyone else on the instance. On a shared
 * deployment that is a tenant isolation failure, not just a capacity one.
 *
 * Counted per authenticated principal rather than per IP wherever one exists.
 * A whole office behind one address is a single IP but many customers, and a
 * distributed client is many addresses but one account; keying on the account
 * is the only version that matches what is actually being limited.
 */

/** Tests exercise these paths hard on purpose and must not be throttled. */
const TESTING = env.NODE_ENV === "test";

export function principalOf(request: Parameters<NonNullable<Options["keyGenerator"]>>[0]): string {
  const auth = (request as { auth?: { apiKeyId?: string; userId?: string } }).auth;
  // An API key gets its own budget rather than sharing the creator's, so a
  // runaway CI job cannot lock its author out of the interface.
  if (auth?.apiKeyId) return `key:${auth.apiKeyId}`;
  if (auth?.userId) return `user:${auth.userId}`;
  return `ip:${request.ip ?? "unknown"}`;
}

function limiter(options: { windowMs: number; limit: number; message: string }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: TESTING ? 100_000 : options.limit,
    keyGenerator: principalOf,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // A limit is a fact about the request, not a fault, so it does not go
    // through the error handler and does not page anyone.
    handler: (_request, response) => {
      response.status(429).json({
        error: { code: "RATE_LIMITED", message: options.message },
      });
    },
  });
}

/**
 * Password guessing. Deliberately by IP as well as account: an attacker
 * spraying one password across many accounts would never trip a per-account
 * limit.
 */
export const authLimiter: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: TESTING ? 100_000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." },
    });
  },
});

/**
 * The default for reads. Generous, because browsing a file tree legitimately
 * fires many requests in a burst, and the point is to stop abuse rather than
 * to make the product feel slow.
 */
export const readLimiter = limiter({
  windowMs: 60_000,
  limit: 600,
  message: "Too many requests. Slow down and try again shortly.",
});

/**
 * Anything that reaches a customer's server or queues work. Lower, because
 * each one costs an SSH round trip or a worker slot — resources shared with
 * every other tenant.
 */
export const remoteLimiter = limiter({
  windowMs: 60_000,
  limit: 120,
  message: "Too many operations against remote servers. Wait a moment and retry.",
});

/**
 * Opening connections and sessions. Lowest of the three: each holds a socket
 * open, and the pool is finite.
 */
export const connectionLimiter = limiter({
  windowMs: 60_000,
  limit: 30,
  message: "Too many connection attempts. Wait a moment and retry.",
});
