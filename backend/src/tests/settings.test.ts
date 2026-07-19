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

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

interface Account { token: string; organizationId: string; userId: string; }

async function newAccount(): Promise<Account> {
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Settings Tester",
    email: `settings-${unique()}@orbit.test`,
    password: "OrbitSettings123!",
    organizationName: `Settings Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  return {
    token: response.body.data.token,
    organizationId: response.body.data.organizations[0].id,
    userId: response.body.data.user.id,
  };
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
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Profile", () => {
  it("persists a change across a reload", async () => {
    const account = await newAccount();
    const saved = await as(account, "patch", "/api/v1/profile").send({
      name: "Renamed Person", jobTitle: "Platform engineer", timezone: "Asia/Shanghai",
    });
    expect(saved.status).toBe(200);

    // The bug this replaces: the form reported success and the value was gone
    // on the next load.
    const reloaded = await as(account, "get", "/api/v1/profile");
    expect(reloaded.body.data.name).toBe("Renamed Person");
    expect(reloaded.body.data.jobTitle).toBe("Platform engineer");
    expect(reloaded.body.data.timezone).toBe("Asia/Shanghai");
  });

  it("stores interface preferences", async () => {
    const account = await newAccount();
    await as(account, "patch", "/api/v1/profile").send({ preferences: { compactTables: true, relativeTimes: false } });
    const reloaded = await as(account, "get", "/api/v1/profile");
    expect(reloaded.body.data.preferences).toMatchObject({ compactTables: true, relativeTimes: false });
  });

  it("re-opens verification when the email changes", async () => {
    const account = await newAccount();
    const changed = await as(account, "patch", "/api/v1/profile").send({ email: `moved-${unique()}@orbit.test` });
    expect(changed.status).toBe(200);
    // A new address has not been proven to belong to this person, and password
    // reset is delivered there.
    expect(changed.body.data.emailVerified).toBe(false);
  });

  it("refuses an address another account already uses", async () => {
    const first = await newAccount();
    const second = await newAccount();
    const existing = await as(first, "get", "/api/v1/profile");

    const response = await as(second, "patch", "/api/v1/profile").send({ email: existing.body.data.email });
    expect(response.status).toBe(409);
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    const account = await newAccount();
    const response = await as(account, "patch", "/api/v1/profile").send({ platformRole: "admin" });
    // Silently dropping it would let a caller believe privilege was granted.
    expect(response.status).toBe(400);
  });
});

describe("Workspace settings", () => {
  it("persists governance settings", async () => {
    const account = await newAccount();
    const saved = await as(account, "patch", "/api/v1/organization").send({
      name: "Renamed Workspace",
      defaultEnvironment: "staging",
      defaultRootPath: "/srv/app",
      requireDeployApproval: true,
      auditRetentionDays: 730,
    });
    expect(saved.status).toBe(200);

    const reloaded = await as(account, "get", "/api/v1/organization");
    expect(reloaded.body.data.name).toBe("Renamed Workspace");
    expect(reloaded.body.data.defaultEnvironment).toBe("staging");
    expect(reloaded.body.data.requireDeployApproval).toBe(true);
    expect(reloaded.body.data.auditRetentionDays).toBe(730);
  });

  it("rejects a slug that is already taken", async () => {
    const first = await newAccount();
    const second = await newAccount();
    const existing = await as(first, "get", "/api/v1/organization");

    const response = await as(second, "patch", "/api/v1/organization").send({ slug: existing.body.data.slug });
    expect(response.status).toBe(409);
  });

  it("rejects a malformed slug", async () => {
    const account = await newAccount();
    const response = await as(account, "patch", "/api/v1/organization").send({ slug: "Not A Slug!" });
    expect(response.status).toBe(400);
  });

  it("reports member and server counts", async () => {
    const account = await newAccount();
    const response = await as(account, "get", "/api/v1/organization");
    expect(response.body.data.counts.members).toBe(1);
    expect(response.body.data.counts.workspaces).toBeGreaterThanOrEqual(1);
  });
});

describe("Policy is enforced, not just stored", () => {
  it("refuses a server with no pinned host key when pinning is required", async () => {
    const account = await newAccount();
    await as(account, "patch", "/api/v1/organization").send({ enforceHostKeyPinning: true });

    const workspaces = await as(account, "get", "/api/v1/workspaces");
    const response = await as(account, "post", "/api/v1/servers").send({
      workspaceId: workspaces.body.data[0].id,
      name: "Unpinned", host: "example.test", username: "deploy", rootPath: "/",
      adapterMode: "sftp", authenticationType: "password", credentials: { password: "secret" },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/pinned host key/i);
  });

  it("refuses password authentication when the workspace disallows it", async () => {
    const account = await newAccount();
    await as(account, "patch", "/api/v1/organization").send({
      enforceHostKeyPinning: false, allowPasswordAuth: false,
    });

    const workspaces = await as(account, "get", "/api/v1/workspaces");
    const response = await as(account, "post", "/api/v1/servers").send({
      workspaceId: workspaces.body.data[0].id,
      name: "Password auth", host: "example.test", username: "deploy", rootPath: "/",
      adapterMode: "sftp", authenticationType: "password", credentials: { password: "secret" },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/password authentication/i);
  });

  it("allows a connection that satisfies the policy", async () => {
    const account = await newAccount();
    await as(account, "patch", "/api/v1/organization").send({
      enforceHostKeyPinning: false, allowPasswordAuth: true,
    });

    const workspaces = await as(account, "get", "/api/v1/workspaces");
    const response = await as(account, "post", "/api/v1/servers").send({
      workspaceId: workspaces.body.data[0].id,
      name: "Compliant", host: "example.test", username: "deploy", rootPath: "/",
      adapterMode: "demo",
    });
    expect(response.status).toBe(201);
  });
});

describe("Ownership transfer", () => {
  it("refuses to transfer to someone outside the workspace", async () => {
    const owner = await newAccount();
    const outsider = await newAccount();
    const response = await as(owner, "post", "/api/v1/organization/transfer-ownership").send({ userId: outsider.userId });
    expect(response.status).toBe(403);
  });

  it("refuses transferring to yourself", async () => {
    const owner = await newAccount();
    const response = await as(owner, "post", "/api/v1/organization/transfer-ownership").send({ userId: owner.userId });
    expect(response.status).toBe(409);
  });
});
