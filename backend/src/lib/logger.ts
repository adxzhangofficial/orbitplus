import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../config/env.js";

/**
 * Structured logging.
 *
 * Log lines are JSON in production so an aggregator can filter on fields rather
 * than parse prose, and human-readable in development where a person is reading
 * them directly.
 *
 * The request id travels in async local storage rather than being threaded
 * through every function signature. A service several calls deep has no
 * business knowing about HTTP, but its log line is useless without knowing
 * which request produced it — this is what connects the two without coupling
 * them.
 */

export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  /** Set on worker jobs, which have no request but still need correlation. */
  jobId?: string;
  queue?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Runs `fn` with these fields attached to every log line it produces. */
export function withLogContext<T>(context: LogContext, fn: () => T): T {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...context }, fn);
}

export function currentLogContext(): LogContext {
  return storage.getStore() ?? {};
}

type Level = "error" | "warn" | "info" | "debug";

const ORDER: Record<Level | "silent", number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function enabled(level: Level): boolean {
  return ORDER[level] <= ORDER[env.LOG_LEVEL];
}

/**
 * Errors do not survive JSON.stringify — it yields `{}` — so they are unpacked
 * explicitly. The stack is kept out of production output because it can carry
 * absolute paths and internal structure into wherever logs are shipped.
 */
function describe(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(env.NODE_ENV === "production" ? {} : { stack: value.stack }),
      ...("code" in value ? { code: (value as { code: unknown }).code } : {}),
    };
  }
  return value;
}

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (!enabled(level)) return;

  const context = currentLogContext();
  const payload: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  };
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = describe(value);
  }

  const line = env.NODE_ENV === "production"
    ? JSON.stringify(payload)
    // Development: the message first, so a person scanning the terminal reads
    // what happened before the metadata.
    : `${level.toUpperCase().padEnd(5)} ${message}${context.requestId ? ` [${context.requestId.slice(0, 8)}]` : ""}${
        Object.keys(fields).length ? ` ${JSON.stringify(Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, describe(value)])))}` : ""
      }`;

  // Warnings and errors go to stderr so they survive a pipeline that keeps only
  // one stream, and so they are separable without parsing.
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
};
