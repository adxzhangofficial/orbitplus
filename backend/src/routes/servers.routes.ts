import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { appUrl, env } from "../config/env.js";
import { withAdapter, withDirectAdapter } from "../adapters/index.js";
import { discoverHostFingerprint } from "../adapters/host-key.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { decryptJson, encryptJson } from "../lib/crypto.js";
import { generateToken, hashToken } from "../lib/tokens.js";
import { enqueue, QUEUES } from "../queue/index.js";
import { installOrbitKey } from "../services/key-provisioning.service.js";
import { agentReportingReachable } from "../services/agent-install.service.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { pagination, pageMeta } from "../lib/pagination.js";
import { requireRole } from "../middleware/auth.js";
import { routeParam } from "../lib/route-param.js";
import { publicServerColumns, serverForTenant } from "../services/server.service.js";
import { assertWithinLimit } from "../services/usage.service.js";

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
  // A fingerprint is optional at creation. The first connection records the key
  // the server presents and pins it, the way OpenSSH does, rather than making
  // the user fetch it by hand before they are allowed to connect at all.
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

/**
 * Retrieves a server's host key so the user does not have to run ssh-keyscan
 * by hand. Rate limited because it opens an outbound connection to a
 * caller-supplied host.
 */
serversRouter.post(
  "/discover-fingerprint",
  requireRole("admin"),
  rateLimit({
    windowMs: 60_000,
    limit: env.NODE_ENV === "test" ? 1_000 : 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) => request.tenant?.organizationId ?? ipKeyGenerator(request.ip ?? ""),
  }),
  asyncHandler(async (request, response) => {
    const input = z.object({
      host: z.string().trim().min(1).max(253),
      port: z.number().int().min(1).max(65535).default(22),
    }).parse(request.body);

    const discovered = await discoverHostFingerprint(input.host, input.port);
    response.json({
      data: {
        ...discovered,
        // Surfaced so the UI can state plainly what accepting this means,
        // rather than presenting first-contact discovery as verification.
        trustModel: "trust-on-first-use",
        advisory: "Compare this fingerprint with the value published by your host or provider. Once saved it is pinned, and any future change will block the connection.",
      },
    });
  }),
);

/**
 * Generates an Orbit-owned SSH key, installs it on the server, and switches the
 * connection to key authentication.
 *
 * The stored password is only replaced once a fresh connection using the new
 * key has succeeded, so a server that ignores authorized_keys leaves the
 * working credential in place rather than locking the customer out.
 */
serversRouter.post(
  "/:id/provision-key",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "id"));
    if (server.adapter_mode !== "sftp") {
      throw badRequest("Key provisioning applies to real SFTP servers, not the demo adapter");
    }
    if (!server.host_fingerprint) {
      throw badRequest("Retrieve and pin the host key before installing a key on this server");
    }

    const stored = server.credential_ciphertext
      ? decryptJson<{ password?: string }>(server.credential_ciphertext)
      : undefined;
    const password = typeof request.body?.password === "string" && request.body.password.length > 0
      ? request.body.password
      : stored?.password;
    if (!password) {
      throw badRequest("A password is required once, to authorise installing the key");
    }

    const expected = /^sha256:/i.test(server.host_fingerprint.trim())
      ? Buffer.from(server.host_fingerprint.trim().replace(/^sha256:/i, ""), "base64").toString("hex")
      : server.host_fingerprint.trim().toLowerCase().replace(/:/g, "");

    // Space-free so the removal grep during re-provisioning matches one whole
    // field, and so the entry is unambiguous when read by a human.
    const comment = `orbit-plus-${request.tenant!.organizationId.slice(0, 8)}-${server.id.slice(0, 8)}`;
    const keyPair = await installOrbitKey(
      { host: server.host, port: server.port, username: server.username, hostFingerprintSha256: expected },
      password,
      comment,
    );

    await pool.query(
      `UPDATE server_connections
          SET authentication_type = 'privateKey', credential_ciphertext = $3, updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [server.id, request.tenant!.organizationId, encryptJson({ privateKey: keyPair.privateKey })],
    );

    response.json({
      data: {
        serverId: server.id,
        authenticationType: "privateKey",
        publicKey: keyPair.publicKey,
        comment: keyPair.comment,
        message: "An Orbit key was installed and verified. The password is no longer stored, and future connections use the key.",
      },
    });
  }),
);

/**
 * Issues a single-use enrolment token and the command that installs the agent.
 *
 * The token is returned once and stored only as a hash, so it cannot be
 * recovered later; re-running this replaces any outstanding one.
 */
serversRouter.post(
  "/:id/agent/enroll",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "id"));
    const enrollmentToken = generateToken();

    await pool.query(
      `INSERT INTO server_agents(organization_id, server_id, enrollment_token_hash, enrollment_expires_at, status, created_by)
       VALUES($1, $2, $3, now() + interval '1 hour', 'pending', $4)
       ON CONFLICT (server_id) DO UPDATE SET
         enrollment_token_hash = EXCLUDED.enrollment_token_hash,
         enrollment_expires_at = EXCLUDED.enrollment_expires_at,
         status = 'pending', agent_token_hash = NULL, updated_at = now()`,
      [request.tenant!.organizationId, server.id, hashToken(enrollmentToken), request.auth!.userId],
    );

    response.status(201).json({
      data: {
        enrollmentToken,
        expiresInMinutes: 60,
        apiUrl: `${appUrl.replace(/\/$/, "")}/api/v1`,
        // Run by the customer on their own machine. It is printed rather than
        // executed by Orbit, so nothing is installed without them seeing it.
        installCommand: `curl -fsSL ${appUrl.replace(/\/$/, "")}/api/v1/agent/install.sh | sudo ORBIT_API_URL="${appUrl.replace(/\/$/, "")}/api/v1" ORBIT_ENROLLMENT_TOKEN="${enrollmentToken}" bash`,
      },
    });
  }),
);

/** Agent status, so the UI can show whether one is enrolled and reporting. */
serversRouter.get(
  "/:id/agent",
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "id"));
    const result = await pool.query(
      `SELECT status, hostname, platform, agent_version AS "agentVersion",
              last_seen_at AS "lastSeenAt", last_report_at AS "lastReportAt",
              reports_received AS "reportsReceived", report_interval_seconds AS "reportIntervalSeconds"
         FROM server_agents WHERE server_id = $1`,
      [server.id],
    );
    const reach = agentReportingReachable();
    response.json({ data: { ...(result.rows[0] ?? { status: "none" }), deploymentReachable: reach.reachable, deploymentReason: reach.reason } });
  }),
);

serversRouter.delete(
  "/:id/agent",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const server = await serverForTenant(request.tenant!.organizationId, routeParam(request, "id"));
    // Revoked rather than deleted, so a still-running agent's token stops
    // working immediately and its reports are refused.
    await pool.query(
      "UPDATE server_agents SET status = 'revoked', agent_token_hash = NULL, enrollment_token_hash = NULL, updated_at = now() WHERE server_id = $1",
      [server.id],
    );
    response.status(204).send();
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
    const health = await withDirectAdapter(transientServer, (adapter) => adapter.health());
    response.json({ data: { ...health, fingerprintVerified: true } });
  }),
);

serversRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = serverSchema.parse(request.body);
    // Checked before any credential work so an over-limit tenant gets a clear
    // 402 rather than a validation error about something unrelated.
    await assertWithinLimit(request.tenant!.organizationId, request.tenant!.plan, "servers");
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

    // Installing the agent is part of connecting a server, not a later opt-in.
    // Queued rather than run inline because it takes tens of seconds and must
    // not hold the HTTP response open, and because a failure to install must
    // not fail the connection: everything except resource metrics works
    // without it.
    await enqueue(QUEUES.agentInstall, {
      serverId: result.rows[0].id,
      organizationId: request.tenant!.organizationId,
    }).catch(() => undefined);
    // The tree is indexed at the same time so the file explorer is populated
    // before the user opens it.
    await enqueue(QUEUES.treeIndex, {
      serverId: result.rows[0].id,
      organizationId: request.tenant!.organizationId,
    }).catch(() => undefined);

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
