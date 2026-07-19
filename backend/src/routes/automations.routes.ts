import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";

const automationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  triggerType: z.enum(["schedule", "webhook", "event", "manual"]),
  schedule: z.string().trim().max(120).nullable().optional(),
  actionType: z.enum(["backup", "deployment", "sync", "health_check", "webhook"]),
  configuration: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

const selectColumns = `id, name, description, trigger_type AS "triggerType", schedule,
  action_type AS "actionType", configuration, enabled, last_run_at AS "lastRunAt",
  next_run_at AS "nextRunAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

export const automationsRouter = Router();

automationsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(`SELECT ${selectColumns} FROM automations WHERE organization_id = $1 ORDER BY created_at DESC`, [request.tenant!.organizationId]);
    response.json({ data: result.rows });
  }),
);

automationsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = automationSchema.parse(request.body);
    const result = await pool.query(
      `INSERT INTO automations(organization_id, name, description, trigger_type, schedule, action_type, configuration, enabled, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING ${selectColumns}`,
      [request.tenant!.organizationId, input.name, input.description, input.triggerType, input.schedule ?? null, input.actionType, JSON.stringify(input.configuration), input.enabled, request.auth!.userId],
    );
    response.status(201).json({ data: result.rows[0] });
  }),
);

automationsRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = automationSchema.partial().parse(request.body);
    const result = await pool.query(
      `UPDATE automations SET name = COALESCE($3, name), description = COALESCE($4, description),
              trigger_type = COALESCE($5, trigger_type), schedule = CASE WHEN $6::boolean THEN $7 ELSE schedule END,
              action_type = COALESCE($8, action_type), configuration = COALESCE($9::jsonb, configuration), enabled = COALESCE($10, enabled)
        WHERE id = $1 AND organization_id = $2 RETURNING ${selectColumns}`,
      [request.params.id, request.tenant!.organizationId, input.name ?? null, input.description ?? null, input.triggerType ?? null, Object.hasOwn(input, "schedule"), input.schedule ?? null, input.actionType ?? null, input.configuration ? JSON.stringify(input.configuration) : null, input.enabled ?? null],
    );
    if (!result.rows[0]) throw notFound("Automation");
    response.json({ data: result.rows[0] });
  }),
);

automationsRouter.post(
  "/:id/run",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `UPDATE automations SET last_run_at = now(), next_run_at = CASE WHEN trigger_type = 'schedule' THEN now() + interval '1 day' ELSE next_run_at END
        WHERE id = $1 AND organization_id = $2 AND enabled RETURNING ${selectColumns}`,
      [request.params.id, request.tenant!.organizationId],
    );
    if (!result.rows[0]) throw notFound("Enabled automation");
    response.status(202).json({ data: { automation: result.rows[0], run: { status: "accepted", requestedAt: new Date().toISOString() } } });
  }),
);

automationsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const result = await pool.query("DELETE FROM automations WHERE id = $1 AND organization_id = $2 RETURNING id", [request.params.id, request.tenant!.organizationId]);
    if (!result.rows[0]) throw notFound("Automation");
    response.status(204).send();
  }),
);
