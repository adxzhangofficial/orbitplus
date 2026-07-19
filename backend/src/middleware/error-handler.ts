import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${request.method} ${request.path} was not found`,
      requestId: request.requestId,
    },
  });
};

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

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    const mapped = code === "23505"
      ? { status: 409, code: "CONFLICT", message: "A resource with these values already exists" }
      : code === "23503"
        ? { status: 409, code: "REFERENCE_CONFLICT", message: "This resource is still referenced by another record" }
        : ["22P02", "22001"].includes(code)
          ? { status: 400, code: "BAD_REQUEST", message: "A request value is invalid" }
          : code === "ENOENT"
            ? { status: 404, code: "NOT_FOUND", message: "The requested file or directory was not found" }
            : code === "EEXIST"
              ? { status: 409, code: "CONFLICT", message: "The file or directory already exists" }
              : code === "EACCES"
                ? { status: 403, code: "FORBIDDEN", message: "The remote filesystem denied access" }
                : null;
    if (mapped) {
      response.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, requestId: request.requestId } });
      return;
    }
  }

  if (env.LOG_LEVEL !== "silent") {
    console.error(`[${request.requestId}]`, error);
  }
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: env.NODE_ENV === "production" ? "An unexpected error occurred" : String(error instanceof Error ? error.message : error),
      requestId: request.requestId,
    },
  });
};
