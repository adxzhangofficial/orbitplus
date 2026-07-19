import { pool } from "../database/pool.js";
import { installAgentOnServer, recordAgentInstallOutcome } from "../services/agent-install.service.js";
import { serverForTenant } from "../services/server.service.js";

export interface AgentInstallJob {
  serverId: string;
  organizationId: string;
}

/**
 * Installs the agent on a newly connected server.
 *
 * A failure is recorded and left visible rather than retried forever: the
 * common causes are a non-root user or a host that cannot reach this
 * deployment, and neither is fixed by trying again.
 */
export async function runAgentInstall(job: AgentInstallJob): Promise<void> {
  const server = await serverForTenant(job.organizationId, job.serverId);
  const result = await installAgentOnServer(server);
  await recordAgentInstallOutcome(server.id, result);

  if (result.installed) {
    console.info("Agent installed", { serverId: server.id, host: server.host });
    return;
  }

  console.warn("Agent not installed", { serverId: server.id, reason: result.reason });
  await pool.query(
    `INSERT INTO notifications(organization_id, title, message, type, resource_type, resource_id)
     VALUES($1, $2, $3, 'warning', 'server', $4)`,
    [
      job.organizationId,
      `Agent not installed on ${server.name}`,
      `${result.reason ?? "The agent could not be installed."} Resource metrics will be unavailable for this server until it is.`,
      server.id,
    ],
  ).catch(() => undefined);
}
