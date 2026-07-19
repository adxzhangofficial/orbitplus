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
let planLimits: typeof import("../services/usage.service.js").planLimits;
let recordUsage: typeof import("../services/usage.service.js").recordUsage;
let usageSnapshot: typeof import("../services/usage.service.js").usageSnapshot;

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

interface Account { token: string; organizationId: string; }

async function newAccount(): Promise<Account> {
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Billing Tester",
    email: `billing-${unique()}@orbit.test`,
    password: "OrbitBilling123!",
    organizationName: `Billing Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  return { token: response.body.data.token, organizationId: response.body.data.organizations[0].id };
}

function as(account: Account, method: "get" | "post" | "patch", path: string) {
  return request(app)[method](path)
    .set("authorization", `Bearer ${account.token}`)
    .set("x-organization-id", account.organizationId);
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  ({ planLimits, recordUsage, usageSnapshot } = await import("../services/usage.service.js"));
  closePool = database.closePool;
  databasePool = database.pool;
  await migrations.migrate();
  await seeding.seed();
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Plan limits", () => {
  it("loads limits from the database", async () => {
    const free = await planLimits("free");
    expect(free.maxServers).toBe(1);
    expect(free.sandboxInternet).toBe(false);
    expect(free.requiresPaymentVerification).toBe(true);

    const enterprise = await planLimits("enterprise");
    // Null means unlimited, which is how enterprise is expressed.
    expect(enterprise.maxServers).toBeNull();
    expect(enterprise.sandboxInternet).toBe(true);
  });

  it("falls back to the most restrictive limits for an unknown plan", async () => {
    const unknown = await planLimits("nonexistent-plan");
    // A bad plan string must never grant free capacity.
    expect(unknown.maxServers).toBe(1);
    expect(unknown.sandboxInternet).toBe(false);
  });

  it("blocks a second server on the free plan", async () => {
    const account = await newAccount();
    const workspaces = await as(account, "get", "/api/v1/workspaces");
    const workspaceId = workspaces.body.data[0].id as string;

    const first = await as(account, "post", "/api/v1/servers").send({
      workspaceId, name: "First server", host: "example.test", username: "deploy",
      rootPath: "/srv", adapterMode: "demo",
    });
    expect(first.status).toBe(201);

    const second = await as(account, "post", "/api/v1/servers").send({
      workspaceId, name: "Second server", host: "example.test", username: "deploy",
      rootPath: "/srv", adapterMode: "demo",
    });
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe("PLAN_LIMIT_REACHED");
  });

  it("allows more servers once the plan is upgraded", async () => {
    const account = await newAccount();
    const workspaces = await as(account, "get", "/api/v1/workspaces");
    const workspaceId = workspaces.body.data[0].id as string;

    await as(account, "post", "/api/v1/servers").send({
      workspaceId, name: "Only server", host: "example.test", username: "deploy",
      rootPath: "/srv", adapterMode: "demo",
    });
    // Simulates what the Stripe webhook does on a successful payment.
    await databasePool.query("UPDATE organizations SET plan = 'pro' WHERE id = $1", [account.organizationId]);

    const second = await as(account, "post", "/api/v1/servers").send({
      workspaceId, name: "Second server", host: "example.test", username: "deploy",
      rootPath: "/srv", adapterMode: "demo",
    });
    expect(second.status).toBe(201);
  });
});

describe("Paid plans cannot be self-granted", () => {
  it("refuses a direct upgrade to pro", async () => {
    const account = await newAccount();
    const response = await as(account, "patch", "/api/v1/billing/plan").send({ plan: "pro" });
    // The whole point: an owner must not be able to grant themselves a paid
    // plan by calling the API. This previously returned 200 and upgraded them.
    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe("CHECKOUT_REQUIRED");

    const organization = await databasePool.query<{ plan: string }>(
      "SELECT plan FROM organizations WHERE id = $1",
      [account.organizationId],
    );
    expect(organization.rows[0]!.plan).toBe("free");
  });

  it("still refuses enterprise", async () => {
    const account = await newAccount();
    const response = await as(account, "patch", "/api/v1/billing/plan").send({ plan: "enterprise" });
    expect(response.status).toBe(403);
  });

  it("reports a clear error when payments are not configured", async () => {
    const account = await newAccount();
    const response = await as(account, "post", "/api/v1/billing/checkout").send({ plan: "pro" });
    // No Stripe keys in the test environment.
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("BILLING_NOT_CONFIGURED");
  });
});

describe("Usage metering", () => {
  it("accumulates usage for the current period", async () => {
    const account = await newAccount();
    await recordUsage(account.organizationId, "sandbox_minutes", 12);
    await recordUsage(account.organizationId, "sandbox_minutes", 8);
    await recordUsage(account.organizationId, "transfer_bytes", 4096);

    const snapshot = await usageSnapshot(account.organizationId, "free");
    expect(snapshot.sandboxMinutes).toBe(20);
    expect(snapshot.transferBytes).toBe(4096);
  });

  it("ignores non-positive quantities", async () => {
    const account = await newAccount();
    await recordUsage(account.organizationId, "sandbox_minutes", 0);
    await recordUsage(account.organizationId, "sandbox_minutes", -5);
    const snapshot = await usageSnapshot(account.organizationId, "free");
    expect(snapshot.sandboxMinutes).toBe(0);
  });

  it("exposes limits and consumption together", async () => {
    const account = await newAccount();
    const response = await as(account, "get", "/api/v1/billing/usage");
    expect(response.status).toBe(200);
    expect(response.body.data.plan).toBe("free");
    expect(response.body.data.limits.maxSandboxMinutes).toBe(60);
    expect(response.body.data.servers).toBe(0);
  });
});

describe("Stripe webhook", () => {
  it("rejects a payload with no valid signature", async () => {
    const response = await request(app)
      .post("/api/v1/webhooks/stripe")
      .set("content-type", "application/json")
      .send({ id: "evt_forged", type: "customer.subscription.updated" });
    // Unauthenticated by design; the signature is the authentication. Without
    // configuration this is 503, and with it an unsigned body is 400.
    expect([400, 503]).toContain(response.status);
    expect(response.status).not.toBe(200);
  });
});
