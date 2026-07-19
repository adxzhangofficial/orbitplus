import "dotenv/config";
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

let app: Express;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;
let adminToken = "";
let adminUserId = "";

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function admin(method: "get" | "post" | "put" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${adminToken}`);
}

interface Customer { token: string; refreshToken: string; organizationId: string; userId: string; email: string }

async function newCustomer(): Promise<Customer> {
  const email = `admin-target-${unique()}@orbit.test`;
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Target Person", email, password: "OrbitTarget123!", organizationName: `Target Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  return {
    token: response.body.data.token,
    refreshToken: response.body.data.refreshToken,
    organizationId: response.body.data.organizations[0].id,
    userId: response.body.data.user.id,
    email,
  };
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
  adminUserId = login.body.data.user.id as string;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Authorisation", () => {
  it("refuses a customer session", async () => {
    const customer = await newCustomer();
    const response = await request(app)
      .post(`/api/v1/admin/users/${customer.userId}/suspend`)
      .set("authorization", `Bearer ${customer.token}`)
      .send({ reason: "Should not be possible" });
    expect(response.status).toBe(403);
  });

  it("refuses an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/admin/feature-flags");
    expect(response.status).toBe(401);
  });
});

describe("Suspending a user", () => {
  it("disables the account and ends every session", async () => {
    const customer = await newCustomer();
    // Confirm the session works before it is taken away.
    expect((await request(app).get("/api/v1/auth/me").set("authorization", `Bearer ${customer.token}`)).status).toBe(200);

    const suspended = await admin("post", `/api/v1/admin/users/${customer.userId}/suspend`)
      .send({ reason: "Suspected credential sharing" });
    expect(suspended.status).toBe(200);

    // Leaving sessions alive would mean a suspended account keeps working
    // until its tokens happen to expire.
    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: customer.refreshToken });
    expect(refresh.status).toBe(401);

    const signIn = await request(app).post("/api/v1/auth/login").send({ email: customer.email, password: "OrbitTarget123!" });
    expect(signIn.status).toBe(401);
  });

  it("requires a reason", async () => {
    const customer = await newCustomer();
    const response = await admin("post", `/api/v1/admin/users/${customer.userId}/suspend`).send({});
    // "Why is this disabled" is the first question asked afterwards, and the
    // audit row is the only place the answer can live.
    expect(response.status).toBe(400);
  });

  it("refuses to suspend the operator's own account", async () => {
    const response = await admin("post", `/api/v1/admin/users/${adminUserId}/suspend`)
      .send({ reason: "Testing self-suspension" });
    // An operator locking themselves out cannot undo it through the product.
    expect(response.status).toBe(409);
  });

  it("restores access", async () => {
    const customer = await newCustomer();
    await admin("post", `/api/v1/admin/users/${customer.userId}/suspend`).send({ reason: "Temporary hold" });
    const restored = await admin("post", `/api/v1/admin/users/${customer.userId}/restore`).send({ reason: "Verified with the customer" });
    expect(restored.status).toBe(200);

    const signIn = await request(app).post("/api/v1/auth/login").send({ email: customer.email, password: "OrbitTarget123!" });
    expect(signIn.status).toBe(200);
  });
});

describe("Suspending an organization", () => {
  it("suspends the tenant and ends its members' sessions", async () => {
    const customer = await newCustomer();
    const suspended = await admin("post", `/api/v1/admin/organizations/${customer.organizationId}/suspend`)
      .send({ reason: "Non-payment after final notice" });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.sessionsRevoked).toBeGreaterThan(0);

    // The account still exists, but the workspace is unreachable.
    const signIn = await request(app).post("/api/v1/auth/login").send({ email: customer.email, password: "OrbitTarget123!" });
    expect(signIn.status).toBe(200);
    const servers = await request(app).get("/api/v1/servers")
      .set("authorization", `Bearer ${signIn.body.data.token}`)
      .set("x-organization-id", customer.organizationId);
    expect(servers.status).toBe(403);
  });

  it("restores the tenant", async () => {
    const customer = await newCustomer();
    await admin("post", `/api/v1/admin/organizations/${customer.organizationId}/suspend`).send({ reason: "Billing hold" });
    const restored = await admin("post", `/api/v1/admin/organizations/${customer.organizationId}/restore`)
      .send({ reason: "Payment received" });
    expect(restored.status).toBe(200);

    const signIn = await request(app).post("/api/v1/auth/login").send({ email: customer.email, password: "OrbitTarget123!" });
    const servers = await request(app).get("/api/v1/servers")
      .set("authorization", `Bearer ${signIn.body.data.token}`)
      .set("x-organization-id", customer.organizationId);
    expect(servers.status).toBe(200);
  });
});

describe("Feature flags", () => {
  it("creates and updates a flag", async () => {
    const key = `test.flag_${unique()}`;
    const created = await admin("put", `/api/v1/admin/feature-flags/${key}`).send({
      name: "Test flag", description: "Exercised by the suite", enabled: true, rolloutPercent: 50,
    });
    expect(created.status).toBe(200);
    expect(created.body.data.rolloutPercent).toBe(50);

    const listed = await admin("get", "/api/v1/admin/feature-flags");
    expect(listed.body.data.some((flag: { key: string }) => flag.key === key)).toBe(true);
  });

  it("assigns rollout consistently for the same organization", async () => {
    const { isFeatureEnabled } = await import("../services/platform-audit.service.js");
    const key = `test.rollout_${unique()}`;
    await admin("put", `/api/v1/admin/feature-flags/${key}`).send({ name: "Rollout", enabled: true, rolloutPercent: 50 });
    const customer = await newCustomer();

    // Random assignment per request would make a partially rolled-out feature
    // appear and disappear as someone clicks around.
    const first = await isFeatureEnabled(key, customer.organizationId);
    for (let index = 0; index < 5; index += 1) {
      expect(await isFeatureEnabled(key, customer.organizationId)).toBe(first);
    }
  });

  it("lets an explicit off-list win over an enabled rollout", async () => {
    const { isFeatureEnabled } = await import("../services/platform-audit.service.js");
    const key = `test.override_${unique()}`;
    const customer = await newCustomer();
    await admin("put", `/api/v1/admin/feature-flags/${key}`).send({
      name: "Override", enabled: true, rolloutPercent: 100,
      disabledOrganizations: [customer.organizationId],
    });
    // A customer who must be kept off a feature cannot be caught by a later
    // rollout change.
    expect(await isFeatureEnabled(key, customer.organizationId)).toBe(false);
  });

  it("reports an unknown flag as off", async () => {
    const { isFeatureEnabled } = await import("../services/platform-audit.service.js");
    const customer = await newCustomer();
    expect(await isFeatureEnabled("never.defined", customer.organizationId)).toBe(false);
  });

  it("rejects a malformed key", async () => {
    const response = await admin("put", "/api/v1/admin/feature-flags/Not A Key").send({ name: "Bad" });
    expect(response.status).toBe(400);
  });
});

describe("Support", () => {
  it("replies to a ticket and records the message", async () => {
    const customer = await newCustomer();
    const ticket = await pool.query<{ id: string }>(
      `INSERT INTO support_tickets(organization_id, opened_by, subject, body, priority)
       VALUES($1,$2,'Cannot connect a server','Getting a timeout','high') RETURNING id`,
      [customer.organizationId, customer.userId],
    );
    const ticketId = ticket.rows[0]!.id;

    const replied = await admin("post", `/api/v1/admin/support/tickets/${ticketId}/reply`)
      .send({ body: "Checking the connection logs now.", status: "pending" });
    expect(replied.status).toBe(201);

    const detail = await admin("get", `/api/v1/admin/support/tickets/${ticketId}`);
    expect(detail.body.data.messages).toHaveLength(1);
    // An operator's words must never be mistaken for the customer's.
    expect(detail.body.data.messages[0].authorRole).toBe("operator");
  });

  it("lists tickets by priority", async () => {
    const response = await admin("get", "/api/v1/admin/support/tickets");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe("Platform audit", () => {
  it("records every action with its actor and reason", async () => {
    const customer = await newCustomer();
    await admin("post", `/api/v1/admin/users/${customer.userId}/suspend`).send({ reason: "Audit trail check" });

    const audit = await admin("get", "/api/v1/admin/platform-audit?action=user.suspend");
    const entry = audit.body.data.find((row: { targetId: string }) => row.targetId === customer.userId);
    expect(entry).toBeTruthy();
    expect(entry.actorEmail).toBe("admin@orbit.dev");
    expect(entry.reason).toBe("Audit trail check");
  });

  it("records session revocation", async () => {
    const customer = await newCustomer();
    await admin("post", `/api/v1/admin/users/${customer.userId}/revoke-sessions`).send({ reason: "Suspected token theft" });

    const audit = await admin("get", "/api/v1/admin/platform-audit?action=user.revoke_sessions");
    expect(audit.body.data.some((row: { targetId: string }) => row.targetId === customer.userId)).toBe(true);
  });
});

describe("Jobs", () => {
  it("reports queue depth per state", async () => {
    const response = await admin("get", "/api/v1/admin/jobs");
    expect(response.status).toBe(200);
    const transfer = response.body.data.find((queue: { name: string }) => queue.name === "transfer.execute");
    expect(transfer).toBeTruthy();
    expect(typeof transfer.ready).toBe("number");
  });
});
