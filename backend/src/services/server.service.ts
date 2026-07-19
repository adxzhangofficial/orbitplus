import { pool } from "../database/pool.js";
import { notFound } from "../lib/errors.js";
import type { ServerConnectionRecord } from "../adapters/remote-filesystem.js";

export async function serverForTenant(organizationId: string, serverId: string): Promise<ServerConnectionRecord> {
  const result = await pool.query<ServerConnectionRecord>(
    `SELECT id, organization_id, workspace_id, name, host, port, username, root_path,
            adapter_mode, authentication_type, credential_ciphertext, host_fingerprint, settings
       FROM server_connections WHERE id = $1 AND organization_id = $2`,
    [serverId, organizationId],
  );
  if (!result.rows[0]) throw notFound("Server");
  return result.rows[0];
}

export const publicServerColumns = `
  s.id, s.workspace_id AS "workspaceId", s.name, s.description, s.host, s.port, s.username,
  s.root_path AS "rootPath", s.environment, s.adapter_mode AS "adapterMode",
  s.authentication_type AS "authenticationType", s.host_fingerprint AS "hostFingerprint",
  s.status, s.last_checked_at AS "lastCheckedAt", s.last_latency_ms AS "lastLatencyMs",
  s.settings, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
  w.name AS "workspaceName"
`;
