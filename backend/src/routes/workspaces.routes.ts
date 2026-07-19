import { Router } from "express";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";

const suffix = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 5);
const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  environment: z.enum(["development", "staging", "production"]).default("production"),
});

function slugify(value: string) {
  return `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace"}-${suffix()}`;
}

export const workspacesRouter = Router();

workspacesRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT w.id, w.name, w.slug, w.description, w.environment,
              w.created_at AS "createdAt", w.updated_at AS "updatedAt",
              count(s.id)::integer AS "serverCount"
         FROM workspaces w LEFT JOIN server_connections s ON s.workspace_id = w.id
        WHERE w.organization_id = $1
        GROUP BY w.id ORDER BY w.created_at`,
      [request.tenant!.organizationId],
    );
    response.json({ data: result.rows });
  }),
);

workspacesRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = workspaceSchema.parse(request.body);
    const result = await pool.query(
      `INSERT INTO workspaces(organization_id, name, slug, description, environment, created_by)
       VALUES($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug, description, environment, created_at AS "createdAt"`,
      [request.tenant!.organizationId, input.name, slugify(input.name), input.description, input.environment, request.auth!.userId],
    );
    response.status(201).json({ data: result.rows[0] });
  }),
);

workspacesRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = workspaceSchema.partial().parse(request.body);
    const result = await pool.query(
      `UPDATE workspaces SET
         name = COALESCE($3, name), description = COALESCE($4, description),
         environment = COALESCE($5, environment)
       WHERE id = $1 AND organization_id = $2
       RETURNING id, name, slug, description, environment, updated_at AS "updatedAt"`,
      [request.params.id, request.tenant!.organizationId, input.name ?? null, input.description ?? null, input.environment ?? null],
    );
    if (!result.rows[0]) throw notFound("Workspace");
    response.json({ data: result.rows[0] });
  }),
);

workspacesRouter.delete(
  "/:id",
  requireRole("owner"),
  asyncHandler(async (request, response) => {
    const count = await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM workspaces WHERE organization_id = $1", [request.tenant!.organizationId]);
    if ((count.rows[0]?.count ?? 0) <= 1) {
      response.status(409).json({ error: { code: "LAST_WORKSPACE", message: "The final workspace cannot be deleted", requestId: request.requestId } });
      return;
    }
    const result = await pool.query("DELETE FROM workspaces WHERE id = $1 AND organization_id = $2 RETURNING id", [request.params.id, request.tenant!.organizationId]);
    if (!result.rows[0]) throw notFound("Workspace");
    response.status(204).send();
  }),
);
