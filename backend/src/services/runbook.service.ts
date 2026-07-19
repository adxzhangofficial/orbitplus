import ssh2 from "ssh2";
import type { Client as SshClient } from "ssh2";
import { resolveAllowedSftpAddress } from "../adapters/egress-policy.js";
import { pool } from "../database/pool.js";
import { decryptJson } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { screenCommand } from "./terminal.service.js";
import type { ServerConnectionRecord, ServerCredentials } from "../adapters/remote-filesystem.js";

const { Client } = ssh2;

/**
 * Runbook execution.
 *
 * Steps run in order over a single SSH connection, so state a step establishes
 * is still there for the next one. Each result is recorded as it completes
 * rather than at the end, so a run that dies partway still shows how far it got.
 */

export interface RunbookStep {
  name: string;
  command: string;
  continueOnError?: boolean;
}

export interface StepResult {
  name: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  skipped?: boolean;
  refusedReason?: string;
}

const STEP_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

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
        keepaliveInterval: 20_000,
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

function runStep(client: SshClient, step: RunbookStep): Promise<StepResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    client.exec(step.command, (error, stream) => {
      if (error) {
        resolve({ name: step.name, command: step.command, exitCode: null, stdout: "", stderr: error.message, durationMs: Date.now() - started });
        return;
      }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        stream.close();
        resolve({
          name: step.name, command: step.command, exitCode: null,
          stdout, stderr: `${stderr}\nStep exceeded ${STEP_TIMEOUT_MS / 1000}s and was stopped.`,
          durationMs: Date.now() - started,
        });
      }, STEP_TIMEOUT_MS);

      // Output is bounded so one chatty command cannot exhaust worker memory
      // or fill the database with a single run's log.
      stream.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString("utf8");
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString("utf8");
      });
      stream.on("close", (code: number) => {
        clearTimeout(timer);
        resolve({
          name: step.name, command: step.command,
          exitCode: code ?? 0,
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
          durationMs: Date.now() - started,
        });
      });
    });
  });
}

export interface RunOutcome {
  status: "succeeded" | "failed";
  results: StepResult[];
  errorMessage?: string;
}

/**
 * Executes a runbook against one server.
 *
 * Stops at the first failing step unless that step opts into continuing, which
 * is the behaviour someone writing an ordered procedure expects: a later step
 * usually assumes the earlier one worked.
 */
export async function executeRunbook(
  runId: string,
  server: ServerConnectionRecord,
  steps: RunbookStep[],
): Promise<RunOutcome> {
  const credentials = server.credential_ciphertext
    ? decryptJson<ServerCredentials>(server.credential_ciphertext)
    : {};

  let client: SshClient;
  try {
    client = await connect(server, credentials);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect";
    await pool.query(
      "UPDATE runbook_runs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1",
      [runId, message],
    );
    return { status: "failed", results: [], errorMessage: message };
  }

  const results: StepResult[] = [];
  let failed = false;

  try {
    for (const step of steps) {
      if (failed) {
        results.push({ name: step.name, command: step.command, exitCode: null, stdout: "", stderr: "", durationMs: 0, skipped: true });
        continue;
      }

      // The same screen the terminal applies. A runbook is written once and
      // then run repeatedly, so a destructive command in one is more dangerous
      // than the same command typed by hand.
      const screened = screenCommand(step.command);
      if (!screened.allowed) {
        results.push({
          name: step.name, command: step.command, exitCode: null,
          stdout: "", stderr: "", durationMs: 0,
          refusedReason: screened.reason,
        });
        failed = true;
        continue;
      }

      const result = await runStep(client, step);
      results.push(result);
      if (result.exitCode !== 0 && !step.continueOnError) failed = true;

      // Persisted as each step completes, so a run that dies partway still
      // shows how far it got.
      await pool.query(
        "UPDATE runbook_runs SET results = $2::jsonb WHERE id = $1",
        [runId, JSON.stringify(results)],
      ).catch(() => undefined);
    }
  } finally {
    client.end();
  }

  const status = failed ? "failed" : "succeeded";
  await pool.query(
    "UPDATE runbook_runs SET status = $2, results = $3::jsonb, finished_at = now() WHERE id = $1",
    [runId, status, JSON.stringify(results)],
  );
  return { status, results };
}
