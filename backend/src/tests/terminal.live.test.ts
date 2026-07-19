import "dotenv/config";
import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import ssh2 from "ssh2";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Integration tests require a dedicated TEST_DATABASE_URL");
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!/(?:^|[-_])test(?:$|[-_])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL must target a database explicitly named for tests");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ALLOW_DEVELOPMENT_SEED = "true";
process.env.SEED_DATABASE_NAME = testDatabaseName;
// The stub SSH server runs on loopback, which the egress policy refuses by
// default. This is the flag that exists for single-host deployments.
process.env.SFTP_ALLOW_LOOPBACK = "true";

const { Server: SshServer } = ssh2;

/**
 * Drives the terminal end to end against a real SSH server: ticket exchange,
 * WebSocket upgrade, PTY allocation, keystrokes reaching the shell, output
 * streaming back, and the session being recorded.
 */

const { privateKey: hostKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
});

let sshServer: InstanceType<typeof SshServer>;
let sshPort = 0;
let httpServer: HttpServer;
let apiPort = 0;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;
let token = "";
let organizationId = "";
let serverId = "";
/** Everything the fake shell received, so input can be asserted. */
let shellInput = "";

beforeAll(async () => {
  // A stub sshd that allocates a PTY and echoes what it is sent.
  sshServer = new SshServer({ hostKeys: [hostKey] }, (client) => {
    client.on("authentication", (context) => context.accept());
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", (acceptPty) => acceptPty?.());
        session.on("shell", (acceptShell) => {
          const stream = acceptShell();
          stream.write("orbit-test-shell$ ");
          stream.on("data", (chunk: Buffer) => {
            shellInput += chunk.toString("utf8");
            stream.write(chunk);
          });
        });
      });
    });
    client.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => {
    sshServer.listen(0, "127.0.0.1", () => { sshPort = (sshServer.address() as AddressInfo).port; resolve(); });
  });

  const { app } = await import("../app.js");
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  const { attachTerminalServer } = await import("../services/terminal.service.js");
  pool = database.pool;
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();

  httpServer = createServer(app);
  attachTerminalServer(httpServer);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => { apiPort = (httpServer.address() as AddressInfo).port; resolve(); });
  });

  const request = (await import("supertest")).default;
  const login = await request(app).post("/api/v1/auth/login").send({ email: "demo@orbit.dev", password: "OrbitDemo123!" });
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;

  // A server pointing at the stub, so the terminal has somewhere real to go.
  const workspace = await pool.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE organization_id = $1 LIMIT 1",
    [organizationId],
  );
  const created = await pool.query<{ id: string }>(
    `INSERT INTO server_connections(organization_id, workspace_id, name, host, port, username, root_path, adapter_mode, authentication_type, credential_ciphertext)
     VALUES($1, $2, 'Terminal target', '127.0.0.1', $3, 'deploy', '/', 'sftp', 'password', $4) RETURNING id`,
    [organizationId, workspace.rows[0]!.id, sshPort, (await import("../lib/crypto.js")).encryptJson({ password: "unused" })],
  );
  serverId = created.rows[0]!.id;
}, 60_000);

afterAll(async () => {
  // Removed before the pool closes. This server points at a stub SSH port that
  // stops existing when this file finishes, so leaving it behind makes every
  // later suite that lists or probes servers fail against a dead address.
  if (pool && serverId) {
    await pool.query("DELETE FROM server_connections WHERE id = $1", [serverId]).catch(() => undefined);
  }
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await new Promise<void>((resolve) => sshServer.close(() => resolve()));
  if (closePool) await closePool();
});

async function issueTicket(): Promise<string> {
  const request = (await import("supertest")).default;
  const { app } = await import("../app.js");
  const response = await request(app)
    .post("/api/v1/terminal/tickets")
    .set("authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId)
    .send({ serverId });
  expect(response.status).toBe(201);
  return response.body.data.ticket as string;
}

function openTerminal(ticket: string): Promise<{ socket: WebSocket; messages: Array<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const messages: Array<Record<string, unknown>> = [];
    const socket = new WebSocket(`ws://127.0.0.1:${apiPort}/api/v1/terminal/ws?ticket=${encodeURIComponent(ticket)}&rows=24&cols=80`);
    const timer = setTimeout(() => reject(new Error("Terminal did not become ready")), 20_000);
    socket.on("message", (raw) => {
      const payload = JSON.parse(raw.toString()) as Record<string, unknown>;
      messages.push(payload);
      if (payload.type === "ready") { clearTimeout(timer); resolve({ socket, messages }); }
      if (payload.type === "error") { clearTimeout(timer); reject(new Error(String(payload.message))); }
    });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

describe("Terminal over a real SSH shell", () => {
  it("opens a session and streams the shell prompt", async () => {
    const { socket, messages } = await openTerminal(await issueTicket());
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const output = messages.filter((m) => m.type === "output").map((m) => String(m.data)).join("");
    // Proof the bytes came from the shell rather than from Orbit.
    expect(output).toContain("orbit-test-shell$");
    socket.close();
  }, 40_000);

  it("delivers keystrokes to the shell", async () => {
    shellInput = "";
    const { socket } = await openTerminal(await issueTicket());
    socket.send(JSON.stringify({ type: "input", data: "whoami\n" }));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(shellInput).toContain("whoami");
    socket.close();
  }, 40_000);

  it("refuses a destructive command before it reaches the shell", async () => {
    shellInput = "";
    const { socket, messages } = await openTerminal(await issueTicket());
    socket.send(JSON.stringify({ type: "input", data: "rm -rf /\n" }));
    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(messages.some((m) => m.type === "blocked")).toBe(true);
    // The command must not have been written to the shell at all.
    expect(shellInput).not.toContain("rm -rf /\n");
    socket.close();
  }, 40_000);

  it("records the session", async () => {
    const { socket } = await openTerminal(await issueTicket());
    socket.send(JSON.stringify({ type: "input", data: "echo recorded\n" }));
    await new Promise((resolve) => setTimeout(resolve, 2600));
    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const session = await pool.query<{ id: string }>(
      "SELECT id FROM terminal_sessions WHERE server_id = $1 ORDER BY started_at DESC LIMIT 1",
      [serverId],
    );
    const chunks = await pool.query<{ stream: string; data: string }>(
      "SELECT stream, data FROM terminal_recordings WHERE session_id = $1",
      [session.rows[0]!.id],
    );
    expect(chunks.rowCount).toBeGreaterThan(0);
    expect(chunks.rows.some((row) => row.stream === "input" && row.data.includes("echo recorded"))).toBe(true);
  }, 40_000);

  it("refuses a ticket that has already been used", async () => {
    const ticket = await issueTicket();
    const first = await openTerminal(ticket);
    first.socket.close();

    // A ticket is single use, so a captured one cannot open a second shell.
    await expect(openTerminal(ticket)).rejects.toThrow(/invalid or has expired/i);
  }, 40_000);

  it("refuses a connection with no ticket", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${apiPort}/api/v1/terminal/ws`);
    const message = await new Promise<string>((resolve, reject) => {
      socket.on("message", (raw) => resolve(String((JSON.parse(raw.toString()) as { message: string }).message)));
      socket.on("error", reject);
      setTimeout(() => reject(new Error("no response")), 8000);
    });
    expect(message).toMatch(/ticket is required/i);
    socket.close();
  }, 20_000);
});
