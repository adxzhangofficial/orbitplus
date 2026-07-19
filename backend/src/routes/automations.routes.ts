import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { requireRole } from "../middleware/auth.js";
import { enqueue, QUEUES } from "../queue/index.js";
import { nextRunAt } from "../workers/automation.worker.js";

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

/**
 * Validates a cron expression and returns its first fire time.
 *
 * Rejecting at write time matters: an unparseable expression would otherwise be
 * stored happily and simply never fire, which looks identical to a broken
 * scheduler from the customer's side.
 */
function scheduleFirstRun(triggerType: string, schedule: string | null): Date | null {
  if (triggerType !== "schedule") return null;
  if (!schedule) throw badRequest("Scheduled automations require a cron expression");
  const next = nextRunAt(schedule);
  if (!next) throw badRequest(`"${schedule}" is not a valid cron expression`);
  return next;
}

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
    const firstRun = scheduleFirstRun(input.triggerType, input.schedule ?? null);
    const result = await pool.query(
      `INSERT INTO automations(organization_id, name, description, trigger_type, schedule, action_type, configuration, enabled, created_by, next_run_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING ${selectColumns}`,
      [request.tenant!.organizationId, input.name, input.description, input.triggerType, input.schedule ?? null, input.actionType, JSON.stringify(input.configuration), input.enabled, request.auth!.userId, firstRun],
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
    const id = routeParam(request, "id");
    const found = await pool.query(
      `SELECT ${selectColumns} FROM automations WHERE id = $1 AND organization_id = $2 AND enabled`,
      [id, request.tenant!.organizationId],
    );
    if (!found.rows[0]) throw notFound("Enabled automation");

    // Actually queued for execution. This endpoint previously only stamped
    // last_run_at and reported "accepted" without running anything.
    const jobId = await enqueue(QUEUES.automation, {
      automationId: id,
      organizationId: request.tenant!.organizationId,
      triggeredBy: "manual",
      userId: request.auth!.userId,
    });

    response.status(202).json({
      data: { automation: found.rows[0], run: { status: "queued", jobId, requestedAt: new Date().toISOString() } },
    });
  }),
);

/** Execution history, so a failed scheduled run is visible rather than silent. */
automationsRouter.get(
  "/:id/runs",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT r.id, r.status, r.triggered_by AS "triggeredBy", r.result, r.error_message AS "errorMessage",
              r.started_at AS "startedAt", r.finished_at AS "finishedAt", r.created_at AS "createdAt",
              u.name AS "triggeredByName"
         FROM automation_runs r
         LEFT JOIN users u ON u.id = r.triggered_by_user
        WHERE r.organization_id = $1 AND r.automation_id = $2
        ORDER BY r.created_at DESC LIMIT 50`,
      [request.tenant!.organizationId, routeParam(request, "id")],
    );
    response.json({ data: result.rows });
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
