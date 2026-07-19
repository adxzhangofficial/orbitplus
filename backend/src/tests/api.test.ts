import "dotenv/config";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("Integration tests require a dedicated TEST_DATABASE_URL; the application DATABASE_URL is never used");
}
const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.replace(/^\//, ""));
if (!/(?:^|[-_])test(?:$|[-_])/i.test(testDatabaseName)) {
  throw new Error("TEST_DATABASE_URL must target a database explicitly named for tests (for example orbit_test)");
}

// These assignments happen before any application module is loaded so the pool
// can never silently fall back to the development or production DATABASE_URL.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ALLOW_DEVELOPMENT_SEED = "true";
process.env.SEED_DATABASE_NAME = testDatabaseName;

let app: Express;
let closePool: () => Promise<void>;
let databasePool: Pool;

let token = "";
let organizationId = "";
let serverId = "";
let workspaceId = "";
let originalReadme = "";
let userId = "";

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  closePool = database.closePool;
  databasePool = database.pool;
  await migrations.migrate();
  await seeding.seed();
  const login = await request(app).post("/api/v1/auth/login").send({ email: "demo@orbit.dev", password: "OrbitDemo123!" });
  expect(login.status).toBe(200);
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;
  userId = login.body.data.user.id as string;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

function customer(method: "get" | "post" | "put" | "patch" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${token}`).set("x-organization-id", organizationId);
}

describe("Orbit API", () => {
  it("reports liveness and database readiness", async () => {
    const health = await request(app).get("/api/v1/health");
    expect(health.status).toBe(200);
    expect(health.body.data.status).toBe("ok");
    const ready = await request(app).get("/api/v1/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.data.database).toBe("connected");
  });

  it("returns the three public plans including Free", async () => {
    const response = await request(app).get("/api/v1/plans");
    expect(response.status).toBe(200);
    expect(response.body.data.map((plan: { id: string }) => plan.id)).toEqual(["free", "pro", "enterprise"]);
  });

  it("enforces authentication with a consistent error envelope", async () => {
    const response = await request(app).get("/api/v1/servers");
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: "UNAUTHORIZED" });
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("lists tenant-scoped servers without exposing credentials", async () => {
    const response = await customer("get", "/api/v1/servers");
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    serverId = response.body.data[0].id as string;
    workspaceId = response.body.data[0].workspaceId as string;
    expect(response.body.data[0].credentialCiphertext).toBeUndefined();
    expect(JSON.stringify(response.body.data[0])).not.toContain("demo-adapter-only");
  });

  it("connects to the tenant-isolated demo SFTP adapter", async () => {
    const response = await customer("post", `/api/v1/servers/${serverId}/test`).send({});
    expect(response.status).toBe(200);
    expect(response.body.data.ok).toBe(true);
  });

  it("parses recursive deletion flags explicitly", async () => {
    const directory = `/delete-parser-${Date.now()}`;
    expect((await customer("post", `/api/v1/servers/${serverId}/files/directory`).send({ path: directory })).status).toBe(201);
    expect((await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path: `${directory}/child.txt`, content: "keep", encoding: "utf8" })).status).toBe(200);

    const ambiguous = await customer("delete", `/api/v1/servers/${serverId}/files/entry`).query({ path: directory, recursive: "yes" });
    expect(ambiguous.status).toBe(400);
    const nonRecursive = await customer("delete", `/api/v1/servers/${serverId}/files/entry`).query({ path: directory, recursive: "false" });
    expect(nonRecursive.status).not.toBe(204);
    const stillPresent = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: `${directory}/child.txt` });
    expect(stillPresent.status).toBe(200);
    expect((await customer("delete", `/api/v1/servers/${serverId}/files/entry`).query({ path: directory, recursive: "true" })).status).toBe(204);
  });

  it("lists, reads, edits, versions, and rolls back a file", async () => {
    const listing = await customer("get", `/api/v1/servers/${serverId}/files`).query({ path: "/" });
    expect(listing.status).toBe(200);
    expect(listing.body.data.some((entry: { name: string }) => entry.name === "README.md")).toBe(true);

    const read = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: "/README.md" });
    expect(read.status).toBe(200);
    originalReadme = read.body.data.content as string;

    const changed = `${originalReadme}\nAPI test edit\n`;
    const write = await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path: "/README.md", content: changed, encoding: "utf8", expectedChecksum: read.body.data.checksum });
    expect(write.status).toBe(200);
    expect(write.body.data.versionNumber).toBeGreaterThan(1);

    const versions = await customer("get", `/api/v1/servers/${serverId}/files/versions`).query({ path: "/README.md" });
    expect(versions.status).toBe(200);
    const original = versions.body.data.find((version: { operation: string }) => version.operation === "pre-write");
    expect(original).toBeTruthy();

    const rollback = await customer("post", `/api/v1/servers/${serverId}/files/rollback`).send({ versionId: original.id, note: "API test rollback" });
    expect(rollback.status).toBe(200);
    const restored = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: "/README.md" });
    expect(restored.body.data.content).toBe(originalReadme);
  });

  it("returns a tenant overview and operational domains", async () => {
    const [overview, monitoring, billing, team] = await Promise.all([
      customer("get", "/api/v1/overview"),
      customer("get", "/api/v1/monitoring"),
      customer("get", "/api/v1/billing"),
      customer("get", "/api/v1/team/members"),
    ]);
    expect(overview.status).toBe(200);
    expect(overview.body.data.counts.servers).toBeGreaterThan(0);
    expect(monitoring.status).toBe(200);
    expect(billing.body.data.subscription.plan).toBe("pro");
    expect(team.body.data.members.length).toBeGreaterThan(0);
  });

  it("blocks suspended and cancelled organizations", async () => {
    for (const status of ["suspended", "cancelled"]) {
      await databasePool.query("UPDATE organizations SET status = $2 WHERE id = $1", [organizationId, status]);
      try {
        const response = await customer("get", "/api/v1/overview");
        expect(response.status).toBe(403);
      } finally {
        await databasePool.query("UPDATE organizations SET status = 'active' WHERE id = $1", [organizationId]);
      }
    }
  });

  it("creates and restores a real filesystem snapshot", async () => {
    // Both halves run on the queue, so the request only accepts the work and
    // the worker is driven directly here. Asserting through the worker is what
    // keeps this test honest about the path production actually takes.
    const { runBackup, runRestore } = await import("../workers/backup.worker.js");
    const filePath = "/var/www/app/config/production.json";
    const before = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: filePath });

    const backup = await customer("post", "/api/v1/backups").send({ serverId, name: `API snapshot ${Date.now()}`, path: "/var/www/app/config", retentionDays: 7 });
    expect(backup.status).toBe(202);
    expect(backup.body.data.status).toBe("queued");
    const backupId = backup.body.data.id as string;

    await runBackup({ backupId, organizationId, serverId, userId, rootPath: "/var/www/app/config" });

    const stored = await customer("get", `/api/v1/backups/${backupId}`);
    expect(stored.body.data.status).toBe("completed");
    expect(stored.body.data.fileCount).toBeGreaterThan(0);

    const changed = await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path: filePath, content: "{\"maintenance\":true}\n", encoding: "utf8", expectedChecksum: before.body.data.checksum });
    expect(changed.status).toBe(200);

    const restore = await customer("post", `/api/v1/backups/${backupId}/restore`).send({});
    expect(restore.status).toBe(202);
    expect(restore.body.data.status).toBe("restoring");

    const key = await databasePool.query<{ storage_key: string }>("SELECT storage_key FROM backups WHERE id = $1", [backupId]);
    await runRestore({ backupId, organizationId, serverId, userId, rootPath: "/", storageKey: key.rows[0]!.storage_key });

    const after = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: filePath });
    expect(after.body.data.content).toBe(before.body.data.content);

    // The row must come back out of 'restoring', or the claim in the restore
    // route would never let anyone restore this snapshot again.
    const settled = await customer("get", `/api/v1/backups/${backupId}`);
    expect(settled.body.data.status).toBe("completed");
    expect(settled.body.data.lastRestoredAt).toBeTruthy();
  });

  it("deploys a versioned artifact and performs a filesystem rollback", async () => {
    const filePath = "/var/www/app/config/production.json";
    const before = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: filePath });
    const deployment = await customer("post", "/api/v1/deployments").send({
      workspaceId,
      serverId,
      name: "API test deployment",
      environment: "production",
      version: `test-${Date.now()}`,
      artifact: { path: filePath, content: "{\"release\":\"candidate\"}\n", encoding: "utf8" },
    });
    expect(deployment.status).toBe(201);
    expect(deployment.body.data.status).toBe("succeeded");
    expect(deployment.body.data.metadata.rollbackVersionId).toBeTruthy();
    const changed = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: filePath });
    expect(changed.body.data.content).toContain("candidate");

    const rollback = await customer("post", `/api/v1/deployments/${deployment.body.data.id}/rollback`).send({});
    expect(rollback.status).toBe(200);
    expect(rollback.body.data.status).toBe("rolled_back");
    const after = await customer("get", `/api/v1/servers/${serverId}/files/content`).query({ path: filePath });
    expect(after.body.data.content).toBe(before.body.data.content);
  });

  it("protects admin APIs and permits a platform administrator", async () => {
    const denied = await customer("get", "/api/v1/admin/overview");
    expect(denied.status).toBe(403);
    const login = await request(app).post("/api/v1/auth/login").send({ email: "admin@orbit.dev", password: "OrbitAdmin123!" });
    const adminUser = await databasePool.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = 'admin@orbit.dev'");
    await databasePool.query("UPDATE memberships SET status = 'disabled' WHERE user_id = $1", [adminUser.rows[0]!.id]);
    try {
      const admin = await request(app).get("/api/v1/admin/overview").set("authorization", `Bearer ${login.body.data.token}`);
      expect(admin.status).toBe(200);
      expect(admin.body.data.counts.organizations).toBeGreaterThan(0);
    } finally {
      await databasePool.query("UPDATE memberships SET status = 'active' WHERE user_id = $1", [adminUser.rows[0]!.id]);
    }
  });
});
