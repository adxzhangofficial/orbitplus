import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ssh2 from "ssh2";
import type { Client as SshClient } from "ssh2";
import { resolveAllowedSftpAddress } from "../adapters/egress-policy.js";
import { appUrl } from "../config/env.js";
import { pool } from "../database/pool.js";
import { decryptJson } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { generateToken, hashToken } from "../lib/tokens.js";
import type { ServerConnectionRecord, ServerCredentials } from "../adapters/remote-filesystem.js";

const { Client } = ssh2;

/**
 * Installs the read-only agent as part of connecting a server.
 *
 * The agent is not an optional extra. CPU, memory, and disk cannot be read over
 * SFTP at all, and a server whose network blocks inbound SSH has no other way
 * to report anything, so a connection without an agent is a connection that
 * silently cannot show most of what the product promises. Making the customer
 * find and run an install command later meant most servers would never have
 * one.
 *
 * The script is piped over the SSH session rather than fetched by the server
 * from Orbit. The machine being configured often cannot reach Orbit's own URL,
 * and this way the bytes that run are the bytes Orbit shipped, with nothing
 * fetched from the network mid-install.
 */

function connect(server: ServerConnectionRecord, credentials: ServerCredentials): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let host: string;
      try { host = await resolveAllowedSftpAddress(server.host); }
      catch (error) { reject(error); return; }

      const client = new Client();
      const timer = setTimeout(() => {
        client.destroy();
        reject(new AppError(504, "SSH_TIMEOUT", `${server.host} did not respond in time`));
      }, 20_000);

      client.on("ready", () => { clearTimeout(timer); resolve(client); });
      client.on("error", (error: Error) => {
        clearTimeout(timer);
        client.destroy();
        reject(new AppError(502, "SSH_CONNECT_FAILED", error.message));
      });

      const pinned = server.host_fingerprint?.trim();
      client.connect({
        host, port: server.port, username: server.username, readyTimeout: 20_000,
        ...(server.authentication_type === "password" ? { password: credentials.password } : {}),
        ...(server.authentication_type === "privateKey"
          ? { privateKey: credentials.privateKey, passphrase: credentials.passphrase }
          : {}),
        hostHash: "sha256",
        hostVerifier: (fingerprint: string) => {
          if (!pinned) return true;
          const expected = /^sha256:/i.test(pinned)
            ? Buffer.from(pinned.replace(/^sha256:/i, ""), "base64").toString("hex")
            : pinned.toLowerCase().replace(/:/g, "");
          return fingerprint.toLowerCase().replace(/:/g, "") === expected;
        },
      });
    })();
  });
}

export interface AgentInstallResult {
  installed: boolean;
  reason?: string;
  output?: string;
}

export async function installAgentOnServer(server: ServerConnectionRecord): Promise<AgentInstallResult> {
  if (server.adapter_mode !== "sftp") {
    return { installed: false, reason: "The demo adapter reads local storage and needs no agent" };
  }

  const enrollmentToken = generateToken();
  await pool.query(
    `INSERT INTO server_agents(organization_id, server_id, enrollment_token_hash, enrollment_expires_at, status)
     VALUES($1, $2, $3, now() + interval '1 hour', 'pending')
     ON CONFLICT (server_id) DO UPDATE SET
       enrollment_token_hash = EXCLUDED.enrollment_token_hash,
       enrollment_expires_at = EXCLUDED.enrollment_expires_at,
       status = 'pending', agent_token_hash = NULL, updated_at = now()`,
    [server.organization_id, server.id, hashToken(enrollmentToken)],
  );

  const credentials = server.credential_ciphertext
    ? decryptJson<ServerCredentials>(server.credential_ciphertext)
    : {};
  const scriptPath = fileURLToPath(new URL("../agent/install.sh", import.meta.url));
  const script = await readFile(scriptPath, "utf8");

  const client = await connect(server, credentials);
  try {
    return await new Promise<AgentInstallResult>((resolve, reject) => {
      // Environment is passed on the command line rather than through setenv,
      // which most sshd configurations refuse by default.
      const command = [
        `ORBIT_API_URL='${`${appUrl.replace(/\/$/, "")}/api/v1`}'`,
        `ORBIT_ENROLLMENT_TOKEN='${enrollmentToken}'`,
        `ORBIT_ROOT='${server.root_path.replace(/'/g, "")}'`,
        "sh -s",
      ].join(" ");

      client.exec(command, (error, stream) => {
        if (error) { reject(new AppError(502, "SSH_EXEC_FAILED", error.message)); return; }
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => { stream.close(); resolve({ installed: false, reason: "The install timed out", output: stdout }); }, 90_000);

        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
        stream.on("close", (code: number) => {
          clearTimeout(timer);
          const output = `${stdout}${stderr}`.trim().slice(-2000);
          if (code === 0 && /Installed\./.test(stdout)) {
            resolve({ installed: true, output });
          } else {
            // Not fatal. The connection itself is fine and everything except
            // resource metrics works without an agent, so the failure is
            // recorded and surfaced rather than blocking the server.
            resolve({ installed: false, reason: describeFailure(output), output });
          }
        });

        // The script arrives on stdin, so nothing is downloaded on the host.
        stream.end(script);
      });
    });
  } finally {
    client.end();
  }
}

function describeFailure(output: string): string {
  if (/permission denied|not permitted|must be root/i.test(output)) {
    return "The connecting user could not write to /usr/local/bin. Connect as root or a sudo-capable user to install the agent.";
  }
  if (/curl.*not found|curl is required/i.test(output)) {
    return "curl is not installed on this server, which the agent needs to report.";
  }
  if (/Enrolment failed|Enrollment failed/i.test(output)) {
    return "The server could not reach Orbit to enrol. Check that this deployment's URL is reachable from the server.";
  }
  return "The agent could not be installed. Everything except resource metrics still works.";
}

export async function recordAgentInstallOutcome(serverId: string, result: AgentInstallResult): Promise<void> {
  if (result.installed) return;
  await pool.query(
    "UPDATE server_agents SET status = 'pending', last_error = $2, updated_at = now() WHERE server_id = $1",
    [serverId, result.reason ?? null],
  );
}
