import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { requireRole } from "../middleware/auth.js";

export const organizationRouter = Router();

organizationRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT id, name, slug, plan, status, settings, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM organizations WHERE id = $1`,
      [request.tenant!.organizationId],
    );
    response.json({ data: { ...result.rows[0], currentUserRole: request.tenant!.role } });
  }),
);

organizationRouter.patch(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      settings: z.object({ timezone: z.string().max(100).optional(), defaultEnvironment: z.enum(["development", "staging", "production"]).optional(), requireBackupBeforeWrite: z.boolean().optional(), sessionTimeoutMinutes: z.number().int().min(15).max(43_200).optional() }).strict().optional(),
    }).strict().parse(request.body);
    const result = await pool.query(
      `UPDATE organizations SET name = COALESCE($2, name), settings = COALESCE($3::jsonb, settings)
        WHERE id = $1 RETURNING id, name, slug, plan, status, settings, updated_at AS "updatedAt"`,
      [request.tenant!.organizationId, input.name ?? null, input.settings ? JSON.stringify(input.settings) : null],
    );
    response.json({ data: result.rows[0] });
  }),
);
