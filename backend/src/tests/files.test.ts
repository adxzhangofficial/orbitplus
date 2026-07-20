import "dotenv/config";
import { createHash } from "node:crypto";
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
let token = "";
let organizationId = "";
let serverId = "";

function customer(method: "get" | "post" | "put" | "delete", path: string) {
  return request(app)[method](path).set("authorization", `Bearer ${token}`).set("x-organization-id", organizationId);
}

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
  const servers = await customer("get", "/api/v1/servers");
  serverId = servers.body.data[0].id as string;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

/**
 * Blobs holding one exact payload.
 *
 * Counting every blob in the organization made this suite depend on nothing
 * else writing at the same time, which is not true — vitest runs test files in
 * parallel. Counting by checksum measures the deduplication property itself
 * and is unaffected by what any other test is doing.
 */
async function blobCountForContent(content: string): Promise<number> {
  const checksum = createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
  const result = await databasePool.query<{ count: string }>(
    "SELECT count(*) FROM file_blobs WHERE organization_id = $1 AND checksum = $2",
    [organizationId, checksum],
  );
  return Number(result.rows[0]!.count);
}

describe("Content-addressed version storage", () => {
  it("stores identical content once no matter how many versions reference it", async () => {
    const path = `/dedupe-${Date.now()}.txt`;
    const content = `stable contents ${Date.now()}`;

    expect(await blobCountForContent(content)).toBe(0);

    // Ten writes of identical bytes.
    for (let index = 0; index < 10; index += 1) {
      const write = await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content });
      expect(write.status).toBe(200);
    }

    const versions = await customer("get", `/api/v1/servers/${serverId}/files/versions?path=${encodeURIComponent(path)}`);
    expect(versions.body.data.length).toBeGreaterThanOrEqual(10);

    // One stored payload, despite ten or more version rows referencing it.
    expect(await blobCountForContent(content)).toBe(1);
  });

  it("stores a separate payload for each distinct content", async () => {
    const path = `/distinct-${Date.now()}.txt`;
    const run = `${Date.now()}-${Math.random()}`;
    const contents = [0, 1, 2].map((index) => `revision number ${index} ${run}`);

    for (const content of contents) {
      const write = await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content });
      expect(write.status).toBe(200);
    }

    // Each distinct payload stored exactly once. Counted per checksum so a
    // concurrent test writing its own files cannot change the result.
    for (const content of contents) {
      expect(await blobCountForContent(content)).toBe(1);
    }
  });

  it("round-trips content through a version and restores it on rollback", async () => {
    const path = `/rollback-${Date.now()}.txt`;
    const original = "the original line";
    const replacement = "the replacement line";

    await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content: original });
    await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content: replacement });

    const versions = await customer("get", `/api/v1/servers/${serverId}/files/versions?path=${encodeURIComponent(path)}`);
    const originalVersion = versions.body.data.find((version: { sizeBytes: number }) => version.sizeBytes === original.length);
    expect(originalVersion).toBeTruthy();

    const rollback = await customer("post", `/api/v1/servers/${serverId}/files/rollback`).send({ versionId: originalVersion.id });
    expect(rollback.status).toBe(200);

    const read = await customer("get", `/api/v1/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`);
    expect(read.body.data.content).toBe(original);
  });

  it("refuses to serve a version whose stored path was altered", async () => {
    const path = `/tamper-${Date.now()}.txt`;
    await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content: "sensitive value" });
    const versions = await customer("get", `/api/v1/servers/${serverId}/files/versions?path=${encodeURIComponent(path)}`);
    const versionId = versions.body.data[0].id as string;

    // Simulate a direct database rewrite of the row's path. The blob AAD no
    // longer covers the path, so only the row signature can catch this. The
    // target is unique per run because (server, path, version) is unique.
    await databasePool.query("UPDATE file_versions SET path = $2 WHERE id = $1", [
      versionId,
      `/tampered-target-${Date.now()}-${Math.floor(Math.random() * 100000)}.txt`,
    ]);

    const rollback = await customer("post", `/api/v1/servers/${serverId}/files/rollback`).send({ versionId });
    expect(rollback.status).toBe(500);
    expect(rollback.body.error.code).toBe("FILE_VERSION_SIGNATURE_INVALID");
  });
});

describe("Rename", () => {
  it("moves version history without re-encrypting payloads", async () => {
    const from = `/rename-src-${Date.now()}.txt`;
    const to = `/rename-dst-${Date.now()}.txt`;
    await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path: from, content: "movable" });

    const renamed = await customer("post", `/api/v1/servers/${serverId}/files/rename`).send({ from, to });
    expect(renamed.status).toBe(200);

    const versions = await customer("get", `/api/v1/servers/${serverId}/files/versions?path=${encodeURIComponent(to)}`);
    expect(versions.body.data.length).toBeGreaterThanOrEqual(1);

    // History must still decrypt and restore at the new path.
    const rollback = await customer("post", `/api/v1/servers/${serverId}/files/rollback`).send({
      versionId: versions.body.data.at(-1).id,
    });
    expect(rollback.status).toBe(200);
  });
});

describe("Upload and download", () => {
  it("uploads multiple files and versions the ones within the limit", async () => {
    const directory = `/uploads-${Date.now()}`;
    await customer("post", `/api/v1/servers/${serverId}/files/directory`).send({ path: directory });

    const response = await request(app)
      .post(`/api/v1/servers/${serverId}/files/upload`)
      .set("authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId)
      .field("path", directory)
      .attach("files", Buffer.from("first upload"), "one.txt")
      .attach("files", Buffer.from("second upload"), "two.txt");

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.every((file: { versioned: boolean }) => file.versioned)).toBe(true);
  });

  it("strips directory components from the uploaded filename", async () => {
    const directory = `/escape-${Date.now()}`;
    await customer("post", `/api/v1/servers/${serverId}/files/directory`).send({ path: directory });

    const response = await request(app)
      .post(`/api/v1/servers/${serverId}/files/upload`)
      .set("authorization", `Bearer ${token}`)
      .set("x-organization-id", organizationId)
      .field("path", directory)
      .attach("files", Buffer.from("contained"), "../../escaped.txt");

    expect(response.status).toBe(201);
    // The traversal segments must not survive into the written path.
    expect(response.body.data[0].path).toBe(`${directory}/escaped.txt`);
  });

  it("downloads a file as an attachment with its checksum", async () => {
    const path = `/download-${Date.now()}.txt`;
    const content = "downloadable contents";
    await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content });

    const response = await customer("get", `/api/v1/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["x-orbit-checksum"]).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.from(response.body).toString("utf8")).toBe(content);
  });
});

describe("Retention", () => {
  it("keeps the newest version of a path even when it is older than the window", async () => {
    const { pruneExpiredVersions } = await import("../services/file.service.js");
    const path = `/retained-${Date.now()}.txt`;
    await customer("put", `/api/v1/servers/${serverId}/files/content`).send({ path, content: "keep me" });

    // Age every version well past the free-plan window.
    await databasePool.query(
      "UPDATE file_versions SET created_at = now() - interval '400 days' WHERE organization_id = $1",
      [organizationId],
    );
    await pruneExpiredVersions(organizationId, "free");

    const versions = await customer("get", `/api/v1/servers/${serverId}/files/versions?path=${encodeURIComponent(path)}`);
    expect(versions.body.data.length).toBe(1);
  });

  it("does not prune anything on the enterprise plan", async () => {
    const { pruneExpiredVersions } = await import("../services/file.service.js");
    const result = await pruneExpiredVersions(organizationId, "enterprise");
    expect(result).toEqual({ versions: 0, blobs: 0 });
  });
});
