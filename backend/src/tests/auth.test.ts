import "dotenv/config";
import type { Express } from "express";
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
let issueAuthToken: typeof import("../services/auth-token.service.js").issueAuthToken;

/** Unique per run so repeated suites never collide on the email unique index. */
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function registerUser(email: string, password = "OrbitTester123!") {
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "Test Person",
    email,
    password,
    organizationName: `Test Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  return response.body.data as { token: string; refreshToken: string; user: { id: string; email: string } };
}

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  ({ issueAuthToken } = await import("../services/auth-token.service.js"));
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Registration and email verification", () => {
  it("creates an unverified account and returns both tokens", async () => {
    const data = await registerUser(`verify-${unique()}@orbit.test`);
    expect(data.token).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user).toMatchObject({ emailVerified: false });
  });

  it("confirms an email with a single-use token", async () => {
    const data = await registerUser(`confirm-${unique()}@orbit.test`);
    const token = await issueAuthToken(data.user.id, "email_verification", 60_000);

    const first = await request(app).post("/api/v1/auth/verify-email").send({ token });
    expect(first.status).toBe(200);
    expect(first.body.data.emailVerified).toBe(true);

    // Replaying a consumed token must not succeed.
    const second = await request(app).post("/api/v1/auth/verify-email").send({ token });
    expect(second.status).toBe(400);

    const me = await request(app).get("/api/v1/auth/me").set("authorization", `Bearer ${data.token}`);
    expect(me.body.data.user.emailVerified).toBe(true);
  });

  it("rejects an expired verification token", async () => {
    const data = await registerUser(`expired-${unique()}@orbit.test`);
    const token = await issueAuthToken(data.user.id, "email_verification", -1_000);
    const response = await request(app).post("/api/v1/auth/verify-email").send({ token });
    expect(response.status).toBe(400);
  });
});

describe("Password reset", () => {
  it("returns an identical response for known and unknown addresses", async () => {
    const email = `known-${unique()}@orbit.test`;
    await registerUser(email);

    const known = await request(app).post("/api/v1/auth/forgot-password").send({ email });
    const unknown = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: `absent-${unique()}@orbit.test` });

    expect(known.status).toBe(unknown.status);
    // An attacker must not be able to distinguish these responses at all.
    expect(known.body).toEqual(unknown.body);
  });

  it("resets the password, invalidates the token, and signs out every session", async () => {
    const email = `reset-${unique()}@orbit.test`;
    const data = await registerUser(email);
    const token = await issueAuthToken(data.user.id, "password_reset", 60_000);

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "BrandNewSecret456!" });
    expect(reset.status).toBe(200);

    // The pre-existing refresh token was issued before the reset, so it is dead.
    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: data.refreshToken });
    expect(refresh.status).toBe(401);

    const oldPassword = await request(app).post("/api/v1/auth/login").send({ email, password: "OrbitTester123!" });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app).post("/api/v1/auth/login").send({ email, password: "BrandNewSecret456!" });
    expect(newPassword.status).toBe(200);

    const replay = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "YetAnotherSecret789!" });
    expect(replay.status).toBe(400);
  });
});

describe("Refresh token rotation", () => {
  it("issues a new refresh token and retires the previous one", async () => {
    const data = await registerUser(`rotate-${unique()}@orbit.test`);

    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: data.refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).toBeTruthy();
    expect(rotated.body.data.refreshToken).not.toBe(data.refreshToken);
    expect(rotated.body.data.token).toBeTruthy();
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const data = await registerUser(`reuse-${unique()}@orbit.test`);

    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: data.refreshToken });
    expect(rotated.status).toBe(200);
    const current = rotated.body.data.refreshToken as string;

    // Replaying the retired token is treated as theft.
    const replay = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: data.refreshToken });
    expect(replay.status).toBe(401);

    // The legitimate client's newest token is revoked too, forcing a fresh login.
    const afterBreach = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: current });
    expect(afterBreach.status).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "not-a-real-refresh-token-value" });
    expect(response.status).toBe(401);
  });
});

describe("Session management", () => {
  it("lists active sessions and revokes one by id", async () => {
    const email = `sessions-${unique()}@orbit.test`;
    const first = await registerUser(email);
    const second = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "OrbitTester123!" });
    expect(second.status).toBe(200);

    const listed = await request(app).get("/api/v1/auth/sessions").set("authorization", `Bearer ${first.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.length).toBeGreaterThanOrEqual(2);

    const target = listed.body.data[0] as { id: string };
    const revoked = await request(app)
      .delete(`/api/v1/auth/sessions/${target.id}`)
      .set("authorization", `Bearer ${first.token}`);
    expect(revoked.status).toBe(204);

    const remaining = await request(app).get("/api/v1/auth/sessions").set("authorization", `Bearer ${first.token}`);
    expect(remaining.body.data.some((session: { id: string }) => session.id === target.id)).toBe(false);
  });

  it("ends a session on logout", async () => {
    const data = await registerUser(`logout-${unique()}@orbit.test`);
    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("authorization", `Bearer ${data.token}`)
      .send({ refreshToken: data.refreshToken });
    expect(logout.status).toBe(204);

    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: data.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe("Password change", () => {
  it("requires the current password and rejects a wrong one", async () => {
    const data = await registerUser(`change-${unique()}@orbit.test`);
    const wrong = await request(app)
      .post("/api/v1/auth/change-password")
      .set("authorization", `Bearer ${data.token}`)
      .send({ currentPassword: "IncorrectPassword1!", newPassword: "ReplacementSecret321!" });
    expect(wrong.status).toBe(401);

    const correct = await request(app)
      .post("/api/v1/auth/change-password")
      .set("authorization", `Bearer ${data.token}`)
      .send({ currentPassword: "OrbitTester123!", newPassword: "ReplacementSecret321!" });
    expect(correct.status).toBe(200);
  });
});
