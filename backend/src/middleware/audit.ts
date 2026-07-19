import type { RequestHandler } from "express";
import { pool } from "../database/pool.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function resourceType(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const apiIndex = parts.indexOf("v1");
  return parts[apiIndex + 1] ?? "unknown";
}

export const auditMutations: RequestHandler = (request, response, next) => {
  response.on("finish", () => {
    if (!mutationMethods.has(request.method) || !request.auth || response.statusCode >= 500) return;
    const action = `${request.method.toLowerCase()}.${resourceType(request.originalUrl)}`;
    const resourceId = typeof request.params.id === "string" ? request.params.id : null;
    void pool.query(
      `INSERT INTO audit_events
         (organization_id, user_id, action, resource_type, resource_id, request_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9::jsonb)`,
      [
        request.tenant?.organizationId ?? null,
        request.auth.userId,
        action,
        resourceType(request.originalUrl),
        resourceId,
        request.requestId,
        request.ip || null,
        request.header("user-agent") ?? null,
        JSON.stringify({ statusCode: response.statusCode, path: request.path }),
      ],
    ).catch((error: unknown) => {
      if (env.LOG_LEVEL === "debug") logger.error("Audit event write failed", { error });
    });
  });
  next();
};
