import "dotenv/config";
import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Integration tests require a dedicated TEST_DATABASE_URL");
const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ""));
if (!/(?:^|[-_])test(?:$|[-_])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL must target a database explicitly named for tests");
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ALLOW_DEVELOPMENT_SEED = "true";
process.env.SEED_DATABASE_NAME = testDatabaseName;

/**
 * The queue plane as the admin console sees it.
 *
 * The property that matters most is that pausing intake loses nothing: the
 * caller still gets a job id, the job does not run, and resuming releases
 * exactly what the pause held and nothing that was deliberately scheduled.
 */

let app: Express;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;
let adminToken = "";

function admin(method: "get" | "post", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${adminToken}`);
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  pool = database.pool;
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@orbit.dev", password: "OrbitAdmin123!" });
  expect(login.status).toBe(200);
  adminToken = login.body.data.token as string;
}, 60_000);

afterEach(async () => {
  // Intake is global state; a test that leaves it paused would silently hold
  // every job queued by every test that follows.
  await admin("post", "/api/v1/admin/jobs/intake").send({ paused: false });
});

afterAll(async () => {
  const { stopBoss } = await import("../queue/index.js");
  await stopBoss();
  if (closePool) await closePool();
});

describe("Reading the queue", () => {
  it("lists queue depth per state", async () => {
    const response = await admin("get", "/api/v1/admin/jobs");
    expect(response.status).toBe(200);
    const transfer = response.body.data.find((queue: { name: string }) => queue.name === "transfer.execute");
    expect(transfer).toBeTruthy();
    expect(typeof transfer.ready).toBe("number");
  });

  it("reports pool capacity from the batch sizes the workers register with", async () => {
    const response = await admin("get", "/api/v1/admin/jobs/pools");
    expect(response.status).toBe(200);
    const { WORKER_BATCH_SIZES } = await import("../queue/index.js");
    const transfer = response.body.data.find((pool: { name: string }) => pool.name === "transfer.execute");
    // Reading the same constant the workers use is what stops the console
    // describing a concurrency nothing is running.
    expect(transfer.capacity).toBe(WORKER_BATCH_SIZES["transfer.execute"]);
  });

  it("returns latency samples without inventing a percentile from nothing", async () => {
    const response = await admin("get", "/api/v1/admin/jobs/latency");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    for (const entry of response.body.data) {
      expect(entry.samples).toBeGreaterThan(0);
      expect(typeof entry.p95Seconds).toBe("number");
    }
  });

  it("refuses a customer session", async () => {
    const registration = await request(app).post("/api/v1/auth/register").send({
      name: "Outsider",
      email: `jobs-outsider-${Date.now()}@orbit.test`,
      password: "OrbitTarget123!",
      organizationName: `Jobs Outsider ${Date.now()}`,
    });
    const response = await request(app)
      .get("/api/v1/admin/jobs/list")
      .set("authorization", `Bearer ${registration.body.data.token}`);
    expect(response.status).toBe(403);
  });
});

describe("Intake control", () => {
  it("holds new work without losing it, and releases it on resume", async () => {
    const { enqueue, QUEUES } = await import("../queue/index.js");
    const { resetIntakeCache, HELD_MARKER } = await import("../queue/intake.js");

    const paused = await admin("post", "/api/v1/admin/jobs/intake").send({ paused: true });
    expect(paused.body.data.paused).toBe(true);

    resetIntakeCache();
    const jobId = await enqueue(QUEUES.tokenPrune, { probe: "held-by-pause" });
    // The caller still gets an id: pausing must not surface as a failed request
    // for something the customer is entitled to do.
    expect(jobId).toBeTruthy();

    const held = await pool.query(
      "SELECT start_after, data FROM pgboss.job WHERE id = $1",
      [jobId],
    );
    expect(held.rows[0].data[HELD_MARKER]).toBe(true);
    expect(new Date(held.rows[0].start_after).getFullYear()).toBeGreaterThan(2100);

    const status = await admin("get", "/api/v1/admin/jobs/intake");
    expect(status.body.data.paused).toBe(true);
    expect(status.body.data.held).toBeGreaterThan(0);

    const resumed = await admin("post", "/api/v1/admin/jobs/intake").send({ paused: false });
    expect(resumed.body.data.released).toBeGreaterThan(0);

    const released = await pool.query("SELECT start_after, data FROM pgboss.job WHERE id = $1", [jobId]);
    expect(new Date(released.rows[0].start_after).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // The marker is removed so a later pause/resume cycle does not re-release
    // a job that has already been released.
    expect(released.rows[0].data[HELD_MARKER]).toBeUndefined();

    await pool.query("DELETE FROM pgboss.job WHERE id = $1", [jobId]);
  });

  it("leaves a deliberately scheduled job on its schedule", async () => {
    const { enqueue, QUEUES } = await import("../queue/index.js");
    const { resetIntakeCache } = await import("../queue/intake.js");

    resetIntakeCache();
    const runAt = new Date(Date.now() + 6 * 3_600_000);
    const scheduledId = await enqueue(QUEUES.tokenPrune, { probe: "scheduled" }, { startAfter: runAt });

    await admin("post", "/api/v1/admin/jobs/intake").send({ paused: true });
    await admin("post", "/api/v1/admin/jobs/intake").send({ paused: false });

    const row = await pool.query("SELECT start_after FROM pgboss.job WHERE id = $1", [scheduledId]);
    // A nightly backup must not start at once because someone cycled intake.
    expect(new Date(row.rows[0].start_after).getTime()).toBeGreaterThan(Date.now() + 3_600_000);

    await pool.query("DELETE FROM pgboss.job WHERE id = $1", [scheduledId]);
  });

  it("records the pause and the resume", async () => {
    await admin("post", "/api/v1/admin/jobs/intake").send({ paused: true });
    await admin("post", "/api/v1/admin/jobs/intake").send({ paused: false });

    const paused = await admin("get", "/api/v1/admin/platform-audit?action=queue.pause");
    expect(paused.body.data.length).toBeGreaterThan(0);
    const resumed = await admin("get", "/api/v1/admin/platform-audit?action=queue.resume");
    expect(resumed.body.data.length).toBeGreaterThan(0);
  });
});

describe("Acting on a job", () => {
  it("retries a failed job as a new job, leaving the original as the record", async () => {
    const { enqueue, QUEUES } = await import("../queue/index.js");
    const { resetIntakeCache } = await import("../queue/intake.js");
    resetIntakeCache();

    const jobId = await enqueue(QUEUES.tokenPrune, { probe: "retry-me" });
    await pool.query("UPDATE pgboss.job SET state = 'failed' WHERE id = $1", [jobId]);

    const response = await admin("post", `/api/v1/admin/jobs/${jobId}/retry`);
    expect(response.status).toBe(201);
    expect(response.body.data.id).not.toBe(jobId);

    const original = await pool.query("SELECT state FROM pgboss.job WHERE id = $1", [jobId]);
    // The failure stays visible; a retry is a new attempt, not an erasure.
    expect(original.rows[0].state).toBe("failed");

    await pool.query("DELETE FROM pgboss.job WHERE id = ANY($1::uuid[])", [[jobId, response.body.data.id]]);
  });

  it("refuses to retry a job that has not failed", async () => {
    const { enqueue, QUEUES } = await import("../queue/index.js");
    const { resetIntakeCache } = await import("../queue/intake.js");
    resetIntakeCache();

    const jobId = await enqueue(QUEUES.tokenPrune, { probe: "still-queued" });
    const response = await admin("post", `/api/v1/admin/jobs/${jobId}/retry`);
    expect(response.status).toBe(409);

    await pool.query("DELETE FROM pgboss.job WHERE id = $1", [jobId]);
  });

  it("reports a job that does not exist rather than pretending", async () => {
    const response = await admin("post", "/api/v1/admin/jobs/00000000-0000-0000-0000-000000000000/retry");
    expect(response.status).toBe(404);
  });

  it("shows a job in the list with the state the console uses", async () => {
    const { enqueue, QUEUES } = await import("../queue/index.js");
    const { resetIntakeCache } = await import("../queue/intake.js");
    resetIntakeCache();

    const jobId = await enqueue(QUEUES.tokenPrune, { probe: "listed" });
    const response = await admin("get", "/api/v1/admin/jobs/list");
    const job = response.body.data.find((row: { id: string }) => row.id === jobId);
    expect(job).toBeTruthy();
    expect(job.status).toBe("queued");
    // Only transfers report partial completion; everything else says so with a
    // null rather than a zero that reads as "no progress made".
    expect(job.progress).toBeNull();

    await pool.query("DELETE FROM pgboss.job WHERE id = $1", [jobId]);
  });
});
