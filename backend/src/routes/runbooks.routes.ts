import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { requireRole, type MembershipRole } from "../middleware/auth.js";
import { executeRunbook } from "../services/runbook.service.js";
import { screenCommand } from "../services/terminal.service.js";
import { serverForTenant } from "../services/server.service.js";

const stepSchema = z.object({
  name: z.string().trim().min(1).max(120),
  command: z.string().trim().min(1).max(4000),
  continueOnError: z.boolean().default(false),
});

const runbookSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  steps: z.array(stepSchema).min(1).max(50),
  requiredRole: z.enum(["developer", "admin", "owner"]).default("developer"),
});

const SELECT = `r.id, r.name, r.description, r.steps, r.required_role AS "requiredRole",
  r.created_at AS "createdAt", r.updated_at AS "updatedAt", u.name AS "createdByName"`;

const ROLE_RANK: Record<MembershipRole, number> = { viewer: 1, developer: 2, admin: 3, owner: 4 };

export const runbooksRouter = Router();

runbooksRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT ${SELECT},
              (SELECT count(*)::integer FROM runbook_runs WHERE runbook_id = r.id) AS "runCount",
              (SELECT max(started_at) FROM runbook_runs WHERE runbook_id = r.id) AS "lastRunAt"
         FROM runbooks r LEFT JOIN users u ON u.id = r.created_by
        WHERE r.organization_id = $1 ORDER BY r.updated_at DESC`,
      [request.tenant!.organizationId],
    );
    response.json({ data: result.rows });
  }),
);

/**
 * Commands are screened when a runbook is saved as well as when it runs.
 *
 * Catching it here means the author sees the problem while they are writing the
 * procedure, rather than discovering it mid-incident when the runbook is the
 * thing they are relying on.
 */
function assertStepsAllowed(steps: Array<{ name: string; command: string }>): void {
  for (const step of steps) {
    const screened = screenCommand(step.command);
    if (!screened.allowed) {
      throw badRequest(`Step "${step.name}" contains a command Orbit refuses to run: ${screened.reason}`);
    }
  }
}

runbooksRouter.post(
  "/",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = runbookSchema.parse(request.body);
    assertStepsAllowed(input.steps);
    const result = await pool.query(
      `INSERT INTO runbooks(organization_id, name, description, steps, required_role, created_by)
       VALUES($1,$2,$3,$4::jsonb,$5,$6)
       RETURNING id, name, description, steps, required_role AS "requiredRole", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [request.tenant!.organizationId, input.name, input.description, JSON.stringify(input.steps), input.requiredRole, request.auth!.userId],
    );
    response.status(201).json({ data: result.rows[0] });
  }),
);

runbooksRouter.patch(
  "/:id",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = runbookSchema.partial().parse(request.body);
    if (input.steps) assertStepsAllowed(input.steps);
    const result = await pool.query(
      `UPDATE runbooks SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         steps = COALESCE($5::jsonb, steps),
         required_role = COALESCE($6, required_role),
         updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, name, description, steps, required_role AS "requiredRole", updated_at AS "updatedAt"`,
      [
        routeParam(request, "id"), request.tenant!.organizationId,
        input.name ?? null, input.description ?? null,
        input.steps ? JSON.stringify(input.steps) : null, input.requiredRole ?? null,
      ],
    );
    if (!result.rows[0]) throw notFound("Runbook");
    response.json({ data: result.rows[0] });
  }),
);

runbooksRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      "DELETE FROM runbooks WHERE id = $1 AND organization_id = $2 RETURNING id",
      [routeParam(request, "id"), request.tenant!.organizationId],
    );
    if (!result.rowCount) throw notFound("Runbook");
    response.status(204).send();
  }),
);

/**
 * Runs a runbook against one server.
 *
 * Executed inline rather than queued: the caller is watching, and a procedure
 * run during an incident is worth far less if its output arrives somewhere else
 * later. Long steps are bounded by their own timeout.
 */
runbooksRouter.post(
  "/:id/run",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ serverId: z.string().uuid() }).parse(request.body);
    const found = await pool.query<{ id: string; name: string; steps: Array<{ name: string; command: string; continueOnError?: boolean }>; required_role: MembershipRole }>(
      "SELECT id, name, steps, required_role FROM runbooks WHERE id = $1 AND organization_id = $2",
      [routeParam(request, "id"), request.tenant!.organizationId],
    );
    const runbook = found.rows[0];
    if (!runbook) throw notFound("Runbook");

    // The runbook's own requirement, on top of the route's. A procedure that
    // touches production can demand more than the page that lists it.
    if (ROLE_RANK[request.tenant!.role] < ROLE_RANK[runbook.required_role]) {
      throw forbidden(`Running "${runbook.name}" requires the ${runbook.required_role} role`);
    }

    const server = await serverForTenant(request.tenant!.organizationId, input.serverId);
    if (server.adapter_mode !== "sftp") {
      throw badRequest("Runbooks execute over SSH, which the demo adapter does not provide");
    }

    const run = await pool.query<{ id: string }>(
      `INSERT INTO runbook_runs(organization_id, runbook_id, server_id, user_id)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [request.tenant!.organizationId, runbook.id, server.id, request.auth!.userId],
    );
    const runId = run.rows[0]!.id;

    const outcome = await executeRunbook(runId, server, runbook.steps);
    response.status(outcome.status === "succeeded" ? 200 : 207).json({ data: { runId, ...outcome } });
  }),
);

runbooksRouter.get(
  "/:id/runs",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT k.id, k.status, k.results, k.error_message AS "errorMessage",
              k.started_at AS "startedAt", k.finished_at AS "finishedAt",
              s.name AS "serverName", u.name AS "userName"
         FROM runbook_runs k
         LEFT JOIN server_connections s ON s.id = k.server_id
         LEFT JOIN users u ON u.id = k.user_id
        WHERE k.organization_id = $1 AND k.runbook_id = $2
        ORDER BY k.started_at DESC LIMIT 25`,
      [request.tenant!.organizationId, routeParam(request, "id")],
    );
    response.json({ data: result.rows });
  }),
);
