import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${request.method} ${request.path} was not found`,
      requestId: request.requestId,
    },
  });
};

interface MappedError { status: number; code: string; message: string }

/**
 * Driver and filesystem errors that describe something the caller did, not a
 * fault in Orbit.
 *
 * Anything missing here becomes a 500 reading "An unexpected error occurred",
 * which is both unhelpful and wrong when the cause is, say, trying to delete a
 * directory without asking for a recursive delete. A table rather than a
 * ternary chain, so adding a case is a line rather than a re-indent.
 */
const ERROR_MAP: Record<string, MappedError> = {
  // PostgreSQL
  "23505": { status: 409, code: "CONFLICT", message: "A resource with these values already exists" },
  "23503": { status: 409, code: "REFERENCE_CONFLICT", message: "This resource is still referenced by another record" },
  "22P02": { status: 400, code: "BAD_REQUEST", message: "A request value is invalid" },
  "22001": { status: 400, code: "BAD_REQUEST", message: "A request value is invalid" },

  // Filesystem, local and remote
  ENOENT: { status: 404, code: "NOT_FOUND", message: "The requested file or directory was not found" },
  EEXIST: { status: 409, code: "CONFLICT", message: "The file or directory already exists" },
  EACCES: { status: 403, code: "FORBIDDEN", message: "The remote filesystem denied access" },
  EPERM: { status: 403, code: "FORBIDDEN", message: "The remote filesystem denied that operation" },
  EROFS: { status: 403, code: "READ_ONLY", message: "The remote filesystem is mounted read-only" },
  EISDIR: { status: 400, code: "IS_A_DIRECTORY", message: "That path is a directory; pass recursive=true to remove it and its contents" },
  ERR_FS_EISDIR: { status: 400, code: "IS_A_DIRECTORY", message: "That path is a directory; pass recursive=true to remove it and its contents" },
  ENOTDIR: { status: 400, code: "NOT_A_DIRECTORY", message: "A component of that path is a file, not a directory" },
  ENOTEMPTY: { status: 409, code: "DIRECTORY_NOT_EMPTY", message: "That directory is not empty; pass recursive=true to remove its contents" },
  ENOSPC: { status: 507, code: "NO_SPACE", message: "The remote filesystem has no space left" },
  EDQUOT: { status: 507, code: "QUOTA_EXCEEDED", message: "The remote filesystem quota is exhausted" },

  // Reaching the remote host at all
  ECONNREFUSED: { status: 502, code: "CONNECTION_REFUSED", message: "The server refused the connection" },
  ECONNRESET: { status: 502, code: "CONNECTION_RESET", message: "The server closed the connection unexpectedly" },
  EHOSTUNREACH: { status: 502, code: "HOST_UNREACHABLE", message: "The server could not be reached" },
  ENETUNREACH: { status: 502, code: "HOST_UNREACHABLE", message: "The server could not be reached" },
  ETIMEDOUT: { status: 504, code: "TIMEOUT", message: "The server did not respond in time" },
};

function mapKnownError(error: unknown): MappedError | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return ERROR_MAP[String((error as { code: unknown }).code)] ?? null;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
        requestId: request.requestId,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        requestId: request.requestId,
      },
    });
    return;
  }

  const mapped = mapKnownError(error);
  if (mapped) {
    response.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, requestId: request.requestId } });
    return;
  }

  // Only unhandled errors reach here — everything above is a shaped response,
  // not a fault. The request id is attached by the logger's own context, so a
  // caller holding the id from the error envelope can be matched to this line.
  logger.error("Unhandled request error", {
    method: request.method,
    path: request.path,
    error,
  });
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: env.NODE_ENV === "production" ? "An unexpected error occurred" : String(error instanceof Error ? error.message : error),
      requestId: request.requestId,
    },
  });
};
