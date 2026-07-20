import "dotenv/config";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
 * The indexed tree must agree with the server.
 *
 * A listing is served from three places: an in-memory cache, a database index
 * built by walking the whole server, and the server itself. The first two are
 * what make browsing feel instant, and both were invalidated on a change —
 * except that invalidating the *changed path* is only correct for a deletion.
 *
 * On a create, the index kept answering from the last full walk. Because it
 * returns rows rather than null whenever a walk has succeeded, that answer was
 * served indefinitely and never fell through to the live server: a file written
 * a second ago was invisible, and a file deleted a week ago was still listed.
 *
 * Found against a real server, where a listing showed a file that no longer
 * existed and omitted one written moments earlier.
 */

let app: Express;
let closePool: () => Promise<void>;
let pool: Pool;
let token = "";
let organizationId = "";
let serverId = "";

function customer(method: "get" | "post" | "put" | "delete", path: string) {
  return request(app)[method](path)
    .set("authorization", `Bearer ${token}`)
    .set("x-organization-id", organizationId);
}

async function listing(path: string): Promise<{ names: string[]; source: string }> {
  const response = await customer("get", `/api/v1/servers/${serverId}/files`).query({ path });
  expect(response.status).toBe(200);
  return {
    names: (response.body.data as Array<{ name: string }>).map((entry) => entry.name),
    source: String(response.headers["x-orbit-cache"]),
  };
}

/**
 * Puts the index into the state that exposed the bug: a completed walk holding
 * one known entry, which the listing endpoint will then answer from.
 */
async function seedIndex(entries: Array<{ path: string; type: string; size: number }>): Promise<void> {
  await pool.query("DELETE FROM remote_entries WHERE server_id = $1", [serverId]);
  for (const entry of entries) {
    const parent = entry.path.split("/").slice(0, -1).join("/") || "/";
    await pool.query(
      `INSERT INTO remote_entries(organization_id, server_id, path, parent_path, name, type, size_bytes)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [organizationId, serverId, entry.path, parent, entry.path.split("/").at(-1), entry.type, entry.size],
    );
  }
  await pool.query(
    `INSERT INTO remote_index_runs(server_id, organization_id, status, updated_at)
     VALUES($1,$2,'ready',now())
     ON CONFLICT (server_id) DO UPDATE SET status = 'ready', updated_at = now()`,
    [serverId, organizationId],
  );
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
    email: "demo@orbit.dev",
    password: "OrbitDemo123!",
  });
  expect(login.status).toBe(200);
  token = login.body.data.token as string;
  organizationId = login.body.data.organizations[0].id as string;
  const servers = await customer("get", "/api/v1/servers");
  serverId = servers.body.data[0].id as string;
}, 60_000);

beforeEach(async () => {
  // Each test decides what the index holds, and a leftover run status from a
  // previous one would change which branch the listing endpoint takes.
  await pool.query("DELETE FROM remote_entries WHERE server_id = $1", [serverId]);
  await pool.query("DELETE FROM remote_index_runs WHERE server_id = $1", [serverId]);
});

afterAll(async () => {
  if (closePool) await closePool();
});

describe("A change is visible in the indexed listing", () => {
  it("shows a file written after the walk", async () => {
    const directory = `/coherence-${Date.now()}`;
    await seedIndex([{ path: directory, type: "directory", size: 0 }]);

    const before = await listing(directory);
    expect(before.source).toBe("index");
    expect(before.names).toEqual([]);

    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/written.txt`, content: "now it exists" });

    // The bug: this still returned the pre-write listing, forever.
    const after = await listing(directory);
    expect(after.names).toContain("written.txt");
  });

  it("reports the size the file actually has", async () => {
    const directory = `/size-${Date.now()}`;
    await seedIndex([{ path: directory, type: "directory", size: 0 }]);

    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/sized.txt`, content: "12345" });

    const response = await customer("get", `/api/v1/servers/${serverId}/files`).query({ path: directory });
    const entry = (response.body.data as Array<{ name: string; size: number }>)
      .find((row) => row.name === "sized.txt");
    expect(entry?.size).toBe(5);
  });

  it("shows a new directory", async () => {
    const directory = `/mkdir-${Date.now()}`;
    await seedIndex([{ path: directory, type: "directory", size: 0 }]);

    await customer("post", `/api/v1/servers/${serverId}/files/directory`)
      .send({ path: `${directory}/child` });

    const after = await listing(directory);
    expect(after.names).toContain("child");
  });

  it("stops showing something that was deleted", async () => {
    const directory = `/deleted-${Date.now()}`;
    await customer("post", `/api/v1/servers/${serverId}/files/directory`).send({ path: directory });
    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/doomed.txt`, content: "temporary" });

    await seedIndex([
      { path: directory, type: "directory", size: 0 },
      { path: `${directory}/doomed.txt`, type: "file", size: 9 },
    ]);
    expect((await listing(directory)).names).toContain("doomed.txt");

    await customer("delete", `/api/v1/servers/${serverId}/files/entry`)
      .query({ path: `${directory}/doomed.txt` });

    expect((await listing(directory)).names).not.toContain("doomed.txt");
  });

  it("keeps the other files in the directory", async () => {
    const directory = `/siblings-${Date.now()}`;
    await seedIndex([
      { path: directory, type: "directory", size: 0 },
      { path: `${directory}/existing-a.txt`, type: "file", size: 3 },
      { path: `${directory}/existing-b.txt`, type: "file", size: 3 },
    ]);

    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/added.txt`, content: "new" });

    // Invalidating the parent instead of recording the entry would empty the
    // directory, which reads as "this folder has nothing in it" — a worse lie
    // than being briefly out of date.
    const after = await listing(directory);
    expect(after.names).toEqual(expect.arrayContaining(["existing-a.txt", "existing-b.txt", "added.txt"]));
  });

  it("moves an entry on rename", async () => {
    const directory = `/renamed-${Date.now()}`;
    await customer("post", `/api/v1/servers/${serverId}/files/directory`).send({ path: directory });
    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/before.txt`, content: "movable" });

    await seedIndex([
      { path: directory, type: "directory", size: 0 },
      { path: `${directory}/before.txt`, type: "file", size: 7 },
    ]);

    await customer("post", `/api/v1/servers/${serverId}/files/rename`)
      .send({ from: `${directory}/before.txt`, to: `${directory}/after.txt` });

    const after = await listing(directory);
    expect(after.names).toContain("after.txt");
    expect(after.names).not.toContain("before.txt");
  });

  it("creates the directories above a file written where the walk never reached", async () => {
    const directory = `/deep-${Date.now()}`;
    await seedIndex([{ path: directory, type: "directory", size: 0 }]);

    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/nested/inner/file.txt`, content: "deep" });

    // Without the ancestor rows the file would exist in the index under a
    // parent that no listing ever returns, so it could never be navigated to.
    expect((await listing(directory)).names).toContain("nested");
    expect((await listing(`${directory}/nested`)).names).toContain("inner");
    expect((await listing(`${directory}/nested/inner`)).names).toContain("file.txt");
  });
});

describe("Without a completed walk", () => {
  it("does not fabricate index coverage from a single write", async () => {
    const directory = `/nowalk-${Date.now()}`;
    await customer("put", `/api/v1/servers/${serverId}/files/content`)
      .send({ path: `${directory}/only.txt`, content: "alone" });

    // A run that never completed must not start answering listings, or a
    // server would appear indexed after one upload and report every directory
    // the walk has not reached as empty.
    const rows = await pool.query(
      "SELECT count(*)::integer AS count FROM remote_entries WHERE server_id = $1",
      [serverId],
    );
    expect(rows.rows[0]!.count).toBe(0);
  });
});
