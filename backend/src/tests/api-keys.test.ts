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
let token = "";
let organizationId = "";

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function session(method: "get" | "post" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${token}`).set("x-organization-id", organizationId);
}

async function createKey(scopes: string[], expiresInDays: number | null = 365) {
  const response = await session("post", "/api/v1/api-keys").send({ name: `Key ${unique()}`, scopes, expiresInDays });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; secret: string; prefix: string };
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "demo@orbit.dev", password: "OrbitDemo123!" });
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Creating keys", () => {
  it("returns the secret once and never again", async () => {
    const created = await createKey(["servers:read"]);
    expect(created.secret).toMatch(/^orb_/);
    expect(created.prefix).toContain("…");

    const listed = await session("get", "/api/v1/api-keys");
    const row = listed.body.data.find((item: { id: string }) => item.id === created.id);
    // The plaintext must not be recoverable from any later read.
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(created.secret);
  });

  it("rejects a scope the API does not implement", async () => {
    const response = await session("post", "/api/v1/api-keys").send({
      name: "Bad scope", scopes: ["everything:always"], expiresInDays: 30,
    });
    // Offering a scope nothing enforces would read as a guarantee.
    expect(response.status).toBe(400);
  });

  it("requires at least one scope", async () => {
    const response = await session("post", "/api/v1/api-keys").send({ name: "No scope", scopes: [], expiresInDays: 30 });
    expect(response.status).toBe(400);
  });
});

describe("Authenticating with a key", () => {
  it("authenticates a request and resolves the tenant", async () => {
    const key = await createKey(["servers:read"]);
    const response = await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key.secret}`);
    // No X-Organization-Id sent: the key knows its own tenant.
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("refuses a key that was never issued", async () => {
    const response = await request(app).get("/api/v1/servers").set("authorization", "Bearer orb_not_a_real_key_value");
    expect(response.status).toBe(401);
  });

  it("refuses a revoked key immediately", async () => {
    const key = await createKey(["servers:read"]);
    expect((await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key.secret}`)).status).toBe(200);

    const revoked = await session("delete", `/api/v1/api-keys/${key.id}`);
    expect(revoked.status).toBe(204);

    const after = await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key.secret}`);
    expect(after.status).toBe(401);
  });

  it("refuses an expired key", async () => {
    const key = await createKey(["servers:read"], 1);
    const database = await import("../database/pool.js");
    await database.pool.query("UPDATE api_keys SET expires_at = now() - interval '1 hour' WHERE id = $1", [key.id]);

    const response = await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key.secret}`);
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/expired/i);
  });

  it("records usage", async () => {
    const key = await createKey(["servers:read"]);
    await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key.secret}`);
    // The counter is updated without blocking the request, so allow it to land.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const listed = await session("get", "/api/v1/api-keys");
    const row = listed.body.data.find((item: { id: string }) => item.id === key.id);
    expect(Number(row.requestCount)).toBeGreaterThan(0);
    expect(row.lastUsedAt).toBeTruthy();
  });
});

describe("Scopes", () => {
  it("allows a domain the key carries", async () => {
    const key = await createKey(["monitoring:read"]);
    const response = await request(app).get("/api/v1/monitoring").set("authorization", `Bearer ${key.secret}`);
    expect(response.status).toBe(200);
  });

  it("refuses a domain the key does not carry", async () => {
    const key = await createKey(["monitoring:read"]);
    // This is what makes a scoped key mean anything: holding one scope must not
    // grant the others.
    const response = await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key.secret}`);
    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/servers:read/);
  });

  it("does not scope-limit a user session", async () => {
    // A member's authority is bounded by their role, not by scopes.
    expect((await session("get", "/api/v1/servers")).status).toBe(200);
    expect((await session("get", "/api/v1/monitoring")).status).toBe(200);
  });
});

describe("Tenant isolation", () => {
  it("ignores an organization header that contradicts the key", async () => {
    const key = await createKey(["servers:read"]);
    const other = await request(app).post("/api/v1/auth/register").send({
      name: "Other Owner",
      email: `other-${unique()}@orbit.test`,
      password: "OrbitOther123!",
      organizationName: `Other Org ${unique()}`,
    });
    const otherOrganizationId = other.body.data.organizations[0].id as string;

    const response = await request(app)
      .get("/api/v1/servers")
      .set("authorization", `Bearer ${key.secret}`)
      .set("x-organization-id", otherOrganizationId);

    // The key stays pinned to its own tenant; the header must not redirect it.
    expect(response.status).toBe(200);
    const listed = await session("get", "/api/v1/servers");
    expect(response.body.data.length).toBe(listed.body.data.length);
  });
});
