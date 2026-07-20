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

/**
 * API key scopes.
 *
 * A key offering "files:read" without "files:write" is a promise that the key
 * cannot change anything. That promise was not kept: every write route under
 * /files, /servers, /backups, /transfers, and /deployments was reachable with a
 * read-only key, because only the read scope was ever checked.
 *
 * These tests exist because the interface offers a read-only key as a safety
 * control. If they fail, that control is decorative again.
 */

let app: Express;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;
let sessionToken = "";
let organizationId = "";
let serverId = "";

async function mintKey(scopes: string[]): Promise<string> {
  const response = await request(app)
    .post("/api/v1/api-keys")
    .set("authorization", `Bearer ${sessionToken}`)
    .send({ name: `Scope test ${scopes.join("+")} ${Date.now()}`, scopes });
  expect(response.status).toBe(201);
  return response.body.data.secret as string;
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

  const login = await request(app).post("/api/v1/auth/login").send({
    email: "admin@orbit.dev",
    password: "OrbitAdmin123!",
  });
  expect(login.status).toBe(200);
  sessionToken = login.body.data.token as string;

  // The server has to belong to the organization the session and the keys
  // resolve to, or every request 404s on tenant scoping and the test proves
  // nothing about scopes.
  organizationId = login.body.data.organizations[0].id as string;
  const server = await pool.query<{ id: string }>(
    "SELECT id FROM server_connections WHERE organization_id = $1 LIMIT 1",
    [organizationId],
  );
  if (!server.rows[0]) throw new Error("The seed did not create a server for the admin organization");
  serverId = server.rows[0].id;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("A read-only key cannot write", () => {
  it("reads files but cannot create a directory", async () => {
    const key = await mintKey(["files:read"]);

    const read = await request(app)
      .get(`/api/v1/servers/${serverId}/files`)
      .query({ path: "/" })
      .set("authorization", `Bearer ${key}`);
    expect(read.status).toBe(200);

    const write = await request(app)
      .post(`/api/v1/servers/${serverId}/files/directory`)
      .set("authorization", `Bearer ${key}`)
      .send({ path: "/scope-test-should-not-exist" });
    expect(write.status).toBe(403);
    expect(write.body.error.message).toContain("files:write");
  });

  it("cannot upload file content", async () => {
    const key = await mintKey(["files:read"]);
    const response = await request(app)
      .put(`/api/v1/servers/${serverId}/files/content`)
      .set("authorization", `Bearer ${key}`)
      .send({ path: "/scope-test.txt", content: "should not be written" });
    expect(response.status).toBe(403);
  });

  it("cannot delete", async () => {
    const key = await mintKey(["files:read"]);
    const response = await request(app)
      .delete(`/api/v1/servers/${serverId}/files/entry`)
      .query({ path: "/README.md" })
      .set("authorization", `Bearer ${key}`);
    expect(response.status).toBe(403);
  });

  it("cannot rename", async () => {
    const key = await mintKey(["files:read"]);
    const response = await request(app)
      .post(`/api/v1/servers/${serverId}/files/rename`)
      .set("authorization", `Bearer ${key}`)
      .send({ from: "/README.md", to: "/RENAMED.md" });
    expect(response.status).toBe(403);
  });

  it("lists servers but cannot delete one", async () => {
    const key = await mintKey(["servers:read"]);

    const list = await request(app).get("/api/v1/servers").set("authorization", `Bearer ${key}`);
    expect(list.status).toBe(200);

    const remove = await request(app)
      .delete(`/api/v1/servers/${serverId}`)
      .set("authorization", `Bearer ${key}`);
    expect(remove.status).toBe(403);
  });

  it("lists backups but cannot queue one", async () => {
    const key = await mintKey(["backups:read"]);

    const list = await request(app).get("/api/v1/backups").set("authorization", `Bearer ${key}`);
    expect(list.status).toBe(200);

    const create = await request(app)
      .post("/api/v1/backups")
      .set("authorization", `Bearer ${key}`)
      .send({ serverId, name: "Scope test backup" });
    expect(create.status).toBe(403);
    expect(create.body.error.message).toContain("backups:write");
  });

  it("cannot start a deployment", async () => {
    const key = await mintKey(["deployments:read"]);
    const response = await request(app)
      .post("/api/v1/deployments")
      .set("authorization", `Bearer ${key}`)
      .send({ serverId, environment: "production", version: "1.0.0" });
    expect(response.status).toBe(403);
  });
});

describe("A write key can write", () => {
  it("creates and removes a directory when the scope is granted", async () => {
    const key = await mintKey(["files:read", "files:write"]);
    const target = `/scope-test-${Date.now()}`;

    const created = await request(app)
      .post(`/api/v1/servers/${serverId}/files/directory`)
      .set("authorization", `Bearer ${key}`)
      .send({ path: target });
    expect(created.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/v1/servers/${serverId}/files/entry`)
      .query({ path: target, recursive: "true" })
      .set("authorization", `Bearer ${key}`);
    expect(removed.status).toBe(204);
  });

  it("still refuses a domain the key was not granted", async () => {
    // Holding files:write must not imply anything about backups.
    const key = await mintKey(["files:read", "files:write"]);
    const response = await request(app)
      .post("/api/v1/backups")
      .set("authorization", `Bearer ${key}`)
      .send({ serverId, name: "Cross-domain scope test" });
    expect(response.status).toBe(403);
  });
});

describe("A user session is not scope-limited", () => {
  it("writes without any scope, because a role already bounds it", async () => {
    const target = `/session-write-${Date.now()}`;
    const response = await request(app)
      .post(`/api/v1/servers/${serverId}/files/directory`)
      .set("authorization", `Bearer ${sessionToken}`)
      .set("x-organization-id", organizationId)
      .send({ path: target });
    expect(response.status).toBe(201);

    await request(app)
      .delete(`/api/v1/servers/${serverId}/files/entry`)
      .query({ path: target, recursive: "true" })
      .set("authorization", `Bearer ${sessionToken}`)
      .set("x-organization-id", organizationId);
  });
});
