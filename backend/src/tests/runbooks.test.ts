import "dotenv/config";
import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";
import ssh2 from "ssh2";
import type { Express } from "express";
import request from "supertest";
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
process.env.SFTP_ALLOW_LOOPBACK = "true";

const { Server: SshServer } = ssh2;

const { privateKey: hostKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
});

let app: Express;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;
let sshServer: InstanceType<typeof SshServer>;
let sshPort = 0;
let token = "";
let organizationId = "";
let serverId = "";
/** Commands the stub actually received, so refusal can be proven. */
let executed: string[] = [];

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function as(method: "get" | "post" | "patch" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${token}`).set("x-organization-id", organizationId);
}

beforeAll(async () => {
  // A stub sshd that echoes the command and exits non-zero when asked to.
  sshServer = new SshServer({ hostKeys: [hostKey] }, (client) => {
    client.on("authentication", (context) => context.accept());
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (acceptExec, _reject, info) => {
          executed.push(info.command);
          const stream = acceptExec();
          if (info.command.includes("exit 1")) {
            stream.stderr.write("step failed\n");
            stream.exit(1);
          } else {
            stream.write(`ran: ${info.command}\n`);
            stream.exit(0);
          }
          stream.end();
        });
      });
    });
    client.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => {
    sshServer.listen(0, "127.0.0.1", () => { sshPort = (sshServer.address() as AddressInfo).port; resolve(); });
  });

  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  pool = database.pool;
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();

  const login = await request(app).post("/api/v1/auth/login").send({ email: "demo@orbit.dev", password: "OrbitDemo123!" });
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;

  const workspace = await pool.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE organization_id = $1 LIMIT 1",
    [organizationId],
  );
  const { encryptJson } = await import("../lib/crypto.js");
  const created = await pool.query<{ id: string }>(
    `INSERT INTO server_connections(organization_id, workspace_id, name, host, port, username, root_path, adapter_mode, authentication_type, credential_ciphertext)
     VALUES($1,$2,'Runbook target','127.0.0.1',$3,'deploy','/','sftp','password',$4) RETURNING id`,
    [organizationId, workspace.rows[0]!.id, sshPort, encryptJson({ password: "unused" })],
  );
  serverId = created.rows[0]!.id;
}, 60_000);

afterAll(async () => {
  // Removed before the pool closes: this points at a stub port that stops
  // existing here, and leaving it behind breaks later suites that probe it.
  if (pool && serverId) {
    await pool.query("DELETE FROM server_connections WHERE id = $1", [serverId]).catch(() => undefined);
  }
  await new Promise<void>((resolve) => sshServer.close(() => resolve()));
  if (closePool) await closePool();
});

async function createRunbook(steps: Array<{ name: string; command: string; continueOnError?: boolean }>, overrides: Record<string, unknown> = {}) {
  const response = await as("post", "/api/v1/runbooks").send({
    name: `Runbook ${unique()}`, description: "Test procedure", steps, ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

describe("Authoring", () => {
  it("stores an ordered sequence of steps", async () => {
    const created = await createRunbook([
      { name: "Check disk", command: "df -h" },
      { name: "Check uptime", command: "uptime" },
    ]);
    const listed = await as("get", "/api/v1/runbooks");
    const row = listed.body.data.find((item: { id: string }) => item.id === created.id);
    expect(row.steps).toHaveLength(2);
    expect(row.steps[0].name).toBe("Check disk");
  });

  it("refuses a destructive command at authoring time", async () => {
    // Caught while the procedure is being written, rather than mid-incident
    // when the runbook is the thing being relied on.
    const response = await as("post", "/api/v1/runbooks").send({
      name: "Dangerous", description: "", steps: [{ name: "Wipe", command: "rm -rf /", continueOnError: false }],
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/refuses to run/i);
  });

  it("requires at least one step", async () => {
    const response = await as("post", "/api/v1/runbooks").send({ name: "Empty", description: "", steps: [] });
    expect(response.status).toBe(400);
  });
});

describe("Execution", () => {
  it("runs every step in order against the server", async () => {
    executed = [];
    const created = await createRunbook([
      { name: "First", command: "echo one" },
      { name: "Second", command: "echo two" },
    ]);

    const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });
    expect(run.status).toBe(200);
    expect(run.body.data.status).toBe("succeeded");
    expect(run.body.data.results).toHaveLength(2);
    // Proof the commands reached the server rather than being simulated.
    expect(executed).toEqual(["echo one", "echo two"]);
    expect(run.body.data.results[0].stdout).toContain("ran: echo one");
  });

  it("stops at a failing step and marks the rest skipped", async () => {
    executed = [];
    const created = await createRunbook([
      { name: "Works", command: "echo fine" },
      { name: "Breaks", command: "exit 1" },
      { name: "Never runs", command: "echo unreachable" },
    ]);

    const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });
    // 207: the request succeeded, the procedure did not.
    expect(run.status).toBe(207);
    expect(run.body.data.status).toBe("failed");
    expect(run.body.data.results[2].skipped).toBe(true);
    // A later step usually assumes the earlier one worked.
    expect(executed).not.toContain("echo unreachable");
  });

  it("continues past a failure when the step allows it", async () => {
    executed = [];
    const created = await createRunbook([
      { name: "Tolerated", command: "exit 1", continueOnError: true },
      { name: "Still runs", command: "echo after" },
    ]);

    const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });
    expect(executed).toContain("echo after");
    expect(run.body.data.results[1].exitCode).toBe(0);
  });

  it("captures exit codes and stderr", async () => {
    const created = await createRunbook([{ name: "Fails", command: "exit 1", continueOnError: true }]);
    const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });
    expect(run.body.data.results[0].exitCode).toBe(1);
    expect(run.body.data.results[0].stderr).toContain("step failed");
  });

  it("records the run for audit", async () => {
    const created = await createRunbook([{ name: "Audited", command: "echo audit" }]);
    await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });

    const runs = await as("get", `/api/v1/runbooks/${created.id}/runs`);
    expect(runs.body.data).toHaveLength(1);
    expect(runs.body.data[0].status).toBe("succeeded");
    expect(runs.body.data[0].userName).toBeTruthy();
    expect(runs.body.data[0].serverName).toBe("Runbook target");
  });

  it("refuses a command that was made destructive after authoring", async () => {
    executed = [];
    const created = await createRunbook([{ name: "Safe", command: "echo safe" }]);
    // Edited directly in the database, as a compromised client or a database
    // change could. The screen at execution is what makes authoring-time
    // validation more than a formality.
    await pool.query(
      `UPDATE runbooks SET steps = '[{"name":"Wipe","command":"rm -rf /","continueOnError":false}]'::jsonb WHERE id = $1`,
      [created.id],
    );

    const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });
    expect(run.body.data.status).toBe("failed");
    expect(run.body.data.results[0].refusedReason).toBeTruthy();
    expect(executed).toHaveLength(0);
  });
});

describe("Authorisation", () => {
  it("refuses to run a runbook that demands a higher role", async () => {
    const created = await createRunbook([{ name: "Privileged", command: "echo privileged" }], { requiredRole: "owner" });
    // Demote the caller for this check.
    await pool.query(
      "UPDATE memberships SET role = 'developer' WHERE organization_id = $1 AND user_id = (SELECT id FROM users WHERE email = 'demo@orbit.dev')",
      [organizationId],
    );
    try {
      const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId });
      expect(run.status).toBe(403);
      expect(run.body.error.message).toMatch(/owner role/i);
    } finally {
      await pool.query(
        "UPDATE memberships SET role = 'owner' WHERE organization_id = $1 AND user_id = (SELECT id FROM users WHERE email = 'demo@orbit.dev')",
        [organizationId],
      );
    }
  });

  it("refuses to run against the demo adapter", async () => {
    const created = await createRunbook([{ name: "Demo", command: "echo demo" }]);
    const servers = await as("get", "/api/v1/servers");
    const demo = servers.body.data.find((item: { adapterMode: string }) => item.adapterMode === "demo");
    if (!demo) return;

    const run = await as("post", `/api/v1/runbooks/${created.id}/run`).send({ serverId: demo.id });
    expect(run.status).toBe(400);
  });
});
