import { Router } from "express";
import { z } from "zod";
import { withAdapter } from "../adapters/index.js";
import { normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { readOptional, saveVersion, versionForTenant, writeVersioned } from "../services/file.service.js";
import { serverForTenant } from "../services/server.service.js";

const deploymentSchema = z.object({
  workspaceId: z.string().uuid(),
  serverId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  environment: z.enum(["development", "staging", "production"]),
  version: z.string().trim().min(1).max(120),
  commitSha: z.string().trim().max(64).optional(),
  artifact: z.object({ path: z.string().min(1).max(2048), content: z.string(), encoding: z.enum(["utf8", "base64"]).default("base64") }).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const deploymentsRouter = Router();

deploymentsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const [items, total] = await Promise.all([
      pool.query(
        `SELECT d.id, d.workspace_id AS "workspaceId", d.server_id AS "serverId", s.name AS "serverName",
                d.name, d.environment, d.version, d.previous_version AS "previousVersion", d.status,
                d.commit_sha AS "commitSha", d.metadata, d.created_at AS "createdAt", d.completed_at AS "completedAt"
           FROM deployments d LEFT JOIN server_connections s ON s.id = d.server_id
          WHERE d.organization_id = $1 ORDER BY d.created_at DESC LIMIT $2 OFFSET $3`,
        [request.tenant!.organizationId, limit, offset],
      ),
      pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM deployments WHERE organization_id = $1", [request.tenant!.organizationId]),
    ]);
    response.json({ data: items.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);

deploymentsRouter.post(
  "/",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = deploymentSchema.parse(request.body);
    const server = await serverForTenant(request.tenant!.organizationId, input.serverId);
    if (server.workspace_id !== input.workspaceId) throw notFound("Server in workspace");
    const previous = await pool.query<{ version: string }>(
      "SELECT version FROM deployments WHERE organization_id = $1 AND server_id = $2 AND status IN ('succeeded', 'rolled_back') ORDER BY created_at DESC LIMIT 1",
      [request.tenant!.organizationId, server.id],
    );
    const created = await pool.query<{ id: string }>(
      `INSERT INTO deployments(organization_id, workspace_id, server_id, name, environment, version, previous_version, status, commit_sha, metadata, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,'running',$8,$9::jsonb,$10) RETURNING id`,
      [request.tenant!.organizationId, input.workspaceId, server.id, input.name, input.environment, input.version, previous.rows[0]?.version ?? null, input.commitSha ?? null, JSON.stringify(input.metadata), request.auth!.userId],
    );
    const id = created.rows[0]!.id;
    try {
      const deploymentMetadata: Record<string, unknown> = { ...input.metadata };
      if (input.artifact) {
        const content = Buffer.from(input.artifact.content, input.artifact.encoding);
        const artifactPath = normalizeRemotePath(input.artifact.path);
        const version = await withAdapter(server, (adapter) => writeVersioned({ adapter, organizationId: request.tenant!.organizationId, serverId: server.id, path: artifactPath, content, userId: request.auth!.userId, note: `Deployment ${input.version}` }));
        deploymentMetadata.artifactPath = artifactPath;
        deploymentMetadata.deployedVersionId = version.id;
        if (version.previousVersionId) deploymentMetadata.rollbackVersionId = version.previousVersionId;
      }
      const result = await pool.query(
        `UPDATE deployments SET status = 'succeeded', completed_at = now(), metadata = $3::jsonb WHERE id = $1 AND organization_id = $2
         RETURNING id, workspace_id AS "workspaceId", server_id AS "serverId", name, environment, version,
                   previous_version AS "previousVersion", status, commit_sha AS "commitSha", metadata,
                   created_at AS "createdAt", completed_at AS "completedAt"`,
        [id, request.tenant!.organizationId, JSON.stringify(deploymentMetadata)],
      );
      response.status(201).json({ data: result.rows[0] });
    } catch (error) {
      await pool.query("UPDATE deployments SET status = 'failed', completed_at = now(), metadata = metadata || jsonb_build_object('error', $2::text) WHERE id = $1", [id, error instanceof Error ? error.message.slice(0, 1000) : "Deployment failed"]);
      throw error;
    }
  }),
);

deploymentsRouter.post(
  "/:id/rollback",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const deploymentResult = await pool.query<{ id: string; server_id: string | null; metadata: { rollbackVersionId?: string } }>(
      "SELECT id, server_id, metadata FROM deployments WHERE id = $1 AND organization_id = $2 AND status = 'succeeded'",
      [request.params.id, request.tenant!.organizationId],
    );
    const deployment = deploymentResult.rows[0];
    if (!deployment) throw notFound("Rollback-ready deployment");
    if (deployment.server_id && deployment.metadata.rollbackVersionId) {
      const server = await serverForTenant(request.tenant!.organizationId, deployment.server_id);
      const version = await versionForTenant(request.tenant!.organizationId, server.id, deployment.metadata.rollbackVersionId);
      await withAdapter(server, async (adapter) => {
        const current = await readOptional(adapter, version.path);
        if (current) await saveVersion({ organizationId: request.tenant!.organizationId, serverId: server.id, path: version.path, content: current, userId: request.auth!.userId, operation: "pre-deployment-rollback", note: `Deployment rollback ${deployment.id}` });
        await adapter.write(version.path, version.content);
        await saveVersion({ organizationId: request.tenant!.organizationId, serverId: server.id, path: version.path, content: version.content, userId: request.auth!.userId, operation: "deployment-rollback", note: `Deployment rollback ${deployment.id}` });
      });
    }
    const result = await pool.query(
      `UPDATE deployments SET status = 'rolled_back', completed_at = now(),
              metadata = metadata || jsonb_build_object('rolledBackAt', now(), 'rolledBackBy', $3::text)
        WHERE id = $1 AND organization_id = $2 AND status = 'succeeded'
        RETURNING id, version, previous_version AS "restoredVersion", status, completed_at AS "completedAt"`,
      [request.params.id, request.tenant!.organizationId, request.auth!.userId],
    );
    if (!result.rows[0]) throw notFound("Rollback-ready deployment");
    response.json({ data: result.rows[0] });
  }),
);
