import "dotenv/config";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("Integration tests require a dedicated TEST_DATABASE_URL; the application DATABASE_URL is never used");
}
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!/(?:^|[-_])test(?:$|[-_])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL must target a database explicitly named for tests (for example orbit_test)");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.ALLOW_DEVELOPMENT_SEED = "true";
process.env.SEED_DATABASE_NAME = testDatabaseName;

let app: Express;
let closePool: () => Promise<void>;
let databasePool: Pool;
let runTransfer: typeof import("../workers/transfer.worker.js").runTransfer;
let runAutomation: typeof import("../workers/automation.worker.js").runAutomation;
let nextRunAt: typeof import("../workers/automation.worker.js").nextRunAt;
let sweepDueAutomations: typeof import("../workers/automation.worker.js").sweepDueAutomations;
let stopBoss: typeof import("../queue/index.js").stopBoss;

let token = "";
let organizationId = "";
let serverId = "";

function customer(method: "get" | "post" | "put" | "delete" | "patch", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${token}`).set("x-organization-id", organizationId);
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  ({ runTransfer } = await import("../workers/transfer.worker.js"));
  ({ runAutomation, nextRunAt, sweepDueAutomations } = await import("../workers/automation.worker.js"));
  ({ stopBoss } = await import("../queue/index.js"));
  closePool = database.closePool;
  databasePool = database.pool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "demo@orbit.dev", password: "OrbitDemo123!" });
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;
  const servers = await customer("get", "/api/v1/servers");
  serverId = servers.body.data[0].id as string;
}, 60_000);

afterAll(async () => {
  await stopBoss().catch(() => undefined);
  if (closePool) await closePool();
});

describe("Transfers are queued rather than executed inline", () => {
  it("returns immediately with a queued transfer", async () => {
    const response = await customer("post", "/api/v1/transfers").send({
      serverId,
      name: "Queued upload",
      direction: "upload",
      sourcePath: "/queued.txt",
      destinationPath: "/queued.txt",
      content: Buffer.from("queued payload").toString("base64"),
      encoding: "base64",
    });
    expect(response.status).toBe(201);
    // The request no longer waits for the remote server.
    expect(response.body.data.status).toBe("queued");
  });

  it("executes a queued transfer when the worker runs it", async () => {
    const created = await customer("post", "/api/v1/transfers").send({
      serverId,
      name: "Worker executed",
      direction: "upload",
      sourcePath: "/worker-executed.txt",
      destinationPath: "/worker-executed.txt",
      content: Buffer.from("written by the worker").toString("base64"),
      encoding: "base64",
    });
    const transferId = created.body.data.id as string;

    await runTransfer({
      transferId,
      organizationId,
      serverId,
      userId: (await databasePool.query("SELECT id FROM users WHERE email = 'demo@orbit.dev'")).rows[0].id,
      direction: "upload",
      sourcePath: "/worker-executed.txt",
      destinationPath: "/worker-executed.txt",
      content: Buffer.from("written by the worker").toString("base64"),
    });

    const after = await customer("get", "/api/v1/transfers?limit=100");
    const transfer = after.body.data.find((item: { id: string }) => item.id === transferId);
    expect(transfer.status).toBe("completed");
    expect(transfer.progress).toBe(100);

    const read = await customer("get", `/api/v1/servers/${serverId}/files/content?path=%2Fworker-executed.txt`);
    expect(read.body.data.content).toBe("written by the worker");
  });

  it("does not run a transfer that was cancelled before pickup", async () => {
    const created = await customer("post", "/api/v1/transfers").send({
      serverId,
      name: "Cancelled before pickup",
      direction: "upload",
      sourcePath: "/never-written.txt",
      destinationPath: "/never-written.txt",
      content: Buffer.from("should not appear").toString("base64"),
      encoding: "base64",
    });
    const transferId = created.body.data.id as string;
    await customer("post", `/api/v1/transfers/${transferId}/cancel`);

    await runTransfer({
      transferId,
      organizationId,
      serverId,
      userId: (await databasePool.query("SELECT id FROM users WHERE email = 'demo@orbit.dev'")).rows[0].id,
      direction: "upload",
      sourcePath: "/never-written.txt",
      destinationPath: "/never-written.txt",
      content: Buffer.from("should not appear").toString("base64"),
    });

    const status = await databasePool.query("SELECT status FROM transfers WHERE id = $1", [transferId]);
    expect(status.rows[0].status).toBe("cancelled");
    // The worker must not have written anything for a cancelled transfer, so
    // the destination is still absent.
    const read = await customer("get", "/api/v1/servers/" + serverId + "/files/content?path=%2Fnever-written.txt");
    expect(read.status).toBe(404);
  });
});

describe("Automation scheduling", () => {
  it("rejects an invalid cron expression at write time", async () => {
    const response = await customer("post", "/api/v1/automations").send({
      name: "Broken schedule",
      triggerType: "schedule",
      schedule: "not a cron expression",
      actionType: "health_check",
      configuration: { serverId },
    });
    expect(response.status).toBe(400);
  });

  it("computes the next run from the cron expression", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const next = nextRunAt("0 3 * * *", from);
    expect(next).toBeTruthy();
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
    // A daily 03:00 schedule must not land more than a day out.
    expect(next!.getTime() - from.getTime()).toBeLessThanOrEqual(86_400_000);
  });

  it("seeds next_run_at when a scheduled automation is created", async () => {
    const created = await customer("post", "/api/v1/automations").send({
      name: "Nightly health check",
      triggerType: "schedule",
      schedule: "0 3 * * *",
      actionType: "health_check",
      configuration: { serverId },
    });
    expect(created.status).toBe(201);
    // Without this the scheduler would never pick the automation up.
    expect(created.body.data.nextRunAt).toBeTruthy();
  });

  it("runs a health check automation and records the outcome", async () => {
    const created = await customer("post", "/api/v1/automations").send({
      name: "Manual health check",
      triggerType: "manual",
      actionType: "health_check",
      configuration: { serverId },
    });
    const automationId = created.body.data.id as string;

    await runAutomation({ automationId, organizationId, triggeredBy: "manual" });

    const runs = await customer("get", `/api/v1/automations/${automationId}/runs`);
    expect(runs.status).toBe(200);
    expect(runs.body.data).toHaveLength(1);
    expect(runs.body.data[0].status).toBe("succeeded");
    expect(runs.body.data[0].result.action).toBe("health_check");
  });

  it("records a failure instead of reporting success", async () => {
    const created = await customer("post", "/api/v1/automations").send({
      name: "Deployment not available",
      triggerType: "manual",
      actionType: "deployment",
      configuration: { serverId },
    });
    const automationId = created.body.data.id as string;

    await expect(runAutomation({ automationId, organizationId, triggeredBy: "manual" })).rejects.toThrow();

    const runs = await customer("get", `/api/v1/automations/${automationId}/runs`);
    expect(runs.body.data[0].status).toBe("failed");
    expect(runs.body.data[0].errorMessage).toBeTruthy();
  });

  it("advances next_run_at when the sweep claims a due automation", async () => {
    const created = await customer("post", "/api/v1/automations").send({
      name: "Due now",
      triggerType: "schedule",
      schedule: "*/5 * * * *",
      actionType: "health_check",
      configuration: { serverId },
    });
    const automationId = created.body.data.id as string;
    await databasePool.query("UPDATE automations SET next_run_at = now() - interval '1 minute' WHERE id = $1", [automationId]);

    await sweepDueAutomations();

    const after = await databasePool.query<{ next_run_at: Date }>(
      "SELECT next_run_at FROM automations WHERE id = $1",
      [automationId],
    );
    // Advanced past now, so a second sweep cannot enqueue the same run twice.
    expect(after.rows[0]!.next_run_at.getTime()).toBeGreaterThan(Date.now());
  });
});
