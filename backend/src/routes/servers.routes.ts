import { Router } from "express";
import { z } from "zod";
import { withAdapter } from "../adapters/index.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { encryptJson } from "../lib/crypto.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { routeParam } from "../lib/route-param.js";
import { publicServerColumns, serverForTenant } from "../services/server.service.js";

const credentialsSchema = z.object({
  password: z.string().max(1024).optional(),
  privateKey: z.string().max(100_000).optional(),
  passphrase: z.string().max(1024).optional(),
}).strict();

const serverSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1).max(128),
  rootPath: z.string().trim().startsWith("/").max(2048).default("/"),
  environment: z.enum(["development", "staging", "production"]).default("production"),
  adapterMode: z.enum(["demo", "sftp"]).default("demo"),
  authenticationType: z.enum(["password", "privateKey"]).default("password"),
  credentials: credentialsSchema.optional(),
  hostFingerprint: z.string().trim().max(256).optional(),
  settings: z.object({
    keepaliveInterval: z.number().int().min(0).max(120_000).optional(),
    connectionTimeout: z.number().int().min(1_000).max(120_000).optional(),
    concurrency: z.number().int().min(1).max(20).optional(),
    ignorePatterns: z.array(z.string().max(512)).max(100).optional(),
  }).strict().default({}),
}).strict();

// Stored rows may carry 'agent' because the schema check constraint permits it,
// while the request schema does not. Accepting the wider stored type here keeps
// updates of pre-existing rows type-safe.
type CredentialInput =
  & Pick<z.infer<typeof serverSchema>, "adapterMode" | "credentials" | "hostFingerprint">
  & { authenticationType: "password" | "privateKey" | "agent" };

const connectionTestSchema = serverSchema.pick({
  host: true,
  port: true,
  username: true,
  rootPath: true,
  adapterMode: true,
  authenticationType: true,
  credentials: true,
  hostFingerprint: true,
  settings: true,
});

function validateCredentials(input: CredentialInput, partial = false): void {
  if (input.adapterMode === "demo") return;
  if (!input.hostFingerprint) throw badRequest("A pinned host fingerprint is required for real SFTP servers");
  // Rejected here as well as in SftpAdapter.connect so a stored 'agent' row fails
  // when it is saved rather than only when a connection is later attempted.
  if (input.authenticationType === "agent") {
    throw badRequest("SSH-agent authentication is disabled on shared workers; use a scoped password or private key");
  }
  if (partial && !input.credentials) return;
  if (input.authenticationType === "password" && !input.credentials?.password) throw badRequest("Password authentication requires a password");
  if (input.authenticationType === "privateKey" && !input.credentials?.privateKey) throw badRequest("Private-key authentication requires a private key");
}

export const serversRouter = Router();

serversRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const { page, limit, offset } = pagination(request);
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const environment = typeof request.query.environment === "string" ? request.query.environment : "";
    const params: unknown[] = [request.tenant!.organizationId, `%${search}%`, environment, limit, offset];
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT ${publicServerColumns}
           FROM server_connections s JOIN workspaces w ON w.id = s.workspace_id
          WHERE s.organization_id = $1
            AND ($2 = '%%' OR s.name ILIKE $2 OR s.host ILIKE $2)
            AND ($3 = '' OR s.environment = $3)
          ORDER BY s.created_at DESC LIMIT $4 OFFSET $5`,
        params,
      ),
      pool.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM server_connections s
          WHERE s.organization_id = $1 AND ($2 = '%%' OR s.name ILIKE $2 OR s.host ILIKE $2)
            AND ($3 = '' OR s.environment = $3)`,
        params.slice(0, 3),
      ),
    ]);
    response.json({ data: rows.rows, meta: pageMeta(total.rows[0]?.count ?? 0, page, limit) });
  }),
);

serversRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT ${publicServerColumns}
         FROM server_connections s JOIN workspaces w ON w.id = s.workspace_id
        WHERE s.id = $1 AND s.organization_id = $2`,
      [request.params.id, request.tenant!.organizationId],
    );
    if (!result.rows[0]) throw notFound("Server");
    response.json({ data: result.rows[0] });
  }),
);

serversRouter.post(
  "/test",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = connectionTestSchema.parse(request.body);
    if (input.adapterMode !== "sftp") throw badRequest("Connection preflight is only available for real SFTP servers");
    validateCredentials(input);
    const transientServer = {
      id: "connection-preflight",
      organization_id: request.tenant!.organizationId,
      workspace_id: "connection-preflight",
      name: "Connection preflight",
      host: input.host,
      port: input.port,
      username: input.username,
      root_path: input.rootPath,
      adapter_mode: input.adapterMode,
      authentication_type: input.authenticationType,
      credential_ciphertext: input.credentials ? encryptJson(input.credentials) : null,
      host_fingerprint: input.hostFingerprint ?? null,
      settings: input.settings,
    } as const;
    const health = await withAdapter(transientServer, (adapter) => adapter.health());
    response.json({ data: { ...health, fingerprintVerified: true } });
  }),
);

serversRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = serverSchema.parse(request.body);
    validateCredentials(input);
    const organization = await pool.query<{ plan: string }>("SELECT plan FROM organizations WHERE id = $1", [request.tenant!.organizationId]);
    const serverCount = await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM server_connections WHERE organization_id = $1", [request.tenant!.organizationId]);
    const limit = organization.rows[0]?.plan === "free" ? 2 : organization.rows[0]?.plan === "pro" ? 50 : Infinity;
    if ((serverCount.rows[0]?.count ?? 0) >= limit) throw conflict(`The ${organization.rows[0]?.plan} plan server limit has been reached`);
    const workspace = await pool.query("SELECT 1 FROM workspaces WHERE id = $1 AND organization_id = $2", [input.workspaceId, request.tenant!.organizationId]);
    if (!workspace.rowCount) throw notFound("Workspace");
    const ciphertext = input.credentials ? encryptJson(input.credentials) : null;
    const result = await pool.query(
      `INSERT INTO server_connections
         (organization_id, workspace_id, name, description, host, port, username, root_path,
          environment, adapter_mode, authentication_type, credential_ciphertext, host_fingerprint,
          settings, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
       RETURNING id`,
      [request.tenant!.organizationId, input.workspaceId, input.name, input.description, input.host, input.port, input.username, input.rootPath, input.environment, input.adapterMode, input.authenticationType, ciphertext, input.hostFingerprint ?? null, JSON.stringify(input.settings), request.auth!.userId],
    );
    const created = await pool.query(
      `SELECT ${publicServerColumns} FROM server_connections s JOIN workspaces w ON w.id = s.workspace_id WHERE s.id = $1 AND s.organization_id = $2`,
      [result.rows[0].id, request.tenant!.organizationId],
    );
    response.status(201).json({ data: created.rows[0] });
  }),
);

serversRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = serverSchema.partial().parse(request.body);
    const existing = await serverForTenant(request.tenant!.organizationId, routeParam(request, "id"));
    if (input.workspaceId) {
      const workspace = await pool.query("SELECT 1 FROM workspaces WHERE id = $1 AND organization_id = $2", [input.workspaceId, request.tenant!.organizationId]);
      if (!workspace.rowCount) throw notFound("Workspace");
    }
    const combined = {
      workspaceId: input.workspaceId ?? existing.workspace_id,
      name: input.name ?? existing.name,
      description: input.description ?? "",
      host: input.host ?? existing.host,
      port: input.port ?? existing.port,
      username: input.username ?? existing.username,
      rootPath: input.rootPath ?? existing.root_path,
      environment: input.environment ?? "production" as const,
      adapterMode: input.adapterMode ?? existing.adapter_mode,
      authenticationType: input.authenticationType ?? existing.authentication_type,
      credentials: input.credentials,
      hostFingerprint: input.hostFingerprint ?? existing.host_fingerprint ?? undefined,
      settings: input.settings ?? existing.settings,
    };
    validateCredentials(combined, true);
    const ciphertext = input.credentials ? encryptJson(input.credentials) : null;
    const result = await pool.query(
      `UPDATE server_connections SET
         workspace_id = COALESCE($3, workspace_id), name = COALESCE($4, name),
         description = COALESCE($5, description), host = COALESCE($6, host),
         port = COALESCE($7, port), username = COALESCE($8, username),
         root_path = COALESCE($9, root_path), environment = COALESCE($10, environment),
         adapter_mode = COALESCE($11, adapter_mode), authentication_type = COALESCE($12, authentication_type),
         credential_ciphertext = COALESCE($13, credential_ciphertext), host_fingerprint = COALESCE($14, host_fingerprint),
         settings = COALESCE($15::jsonb, settings), status = 'unknown'
       WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [request.params.id, request.tenant!.organizationId, input.workspaceId ?? null, input.name ?? null, input.description ?? null, input.host ?? null, input.port ?? null, input.username ?? null, input.rootPath ?? null, input.environment ?? null, input.adapterMode ?? null, input.authenticationType ?? null, ciphertext, input.hostFingerprint ?? null, input.settings ? JSON.stringify(input.settings) : null],
    );
    if (!result.rows[0]) throw notFound("Server");
    const updated = await pool.query(`SELECT ${publicServerColumns} FROM server_connections s JOIN workspaces w ON w.id = s.workspace_id WHERE s.id = $1 AND s.organization_id = $2`, [request.params.id, request.tenant!.organizationId]);
    response.json({ data: updated.rows[0] });
  }),
);

serversRouter.post(
  "/:id/test",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "id"));
    try {
      const health = await withAdapter(server, (adapter) => adapter.health());
      await pool.query("UPDATE server_connections SET status = 'online', last_checked_at = now(), last_latency_ms = $3 WHERE id = $1 AND organization_id = $2", [server.id, server.organization_id, health.latencyMs]);
      response.json({ data: health });
    } catch (error) {
      await pool.query("UPDATE server_connections SET status = 'offline', last_checked_at = now() WHERE id = $1 AND organization_id = $2", [server.id, server.organization_id]);
      throw error;
    }
  }),
);

serversRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const result = await pool.query("DELETE FROM server_connections WHERE id = $1 AND organization_id = $2 RETURNING id", [request.params.id, request.tenant!.organizationId]);
    if (!result.rows[0]) throw notFound("Server");
    response.status(204).send();
  }),
);
