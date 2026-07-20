import "dotenv/config";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateCode } from "../lib/totp.js";

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
 * Two-factor authentication.
 *
 * The account holds SSH credentials for production servers, so the property
 * that matters is that a correct password alone is not a session. Everything
 * else here exists to make sure the protection cannot be stripped, replayed, or
 * bypassed by someone who already has the password.
 */

let app: Express;
let closePool: () => Promise<void>;
let pool: import("pg").Pool;

const unique = () => `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const PASSWORD = "OrbitMfaTest123!";

interface Account { token: string; email: string; userId: string }

async function newAccount(): Promise<Account> {
  const email = `mfa-${unique()}@orbit.test`;
  const response = await request(app).post("/api/v1/auth/register").send({
    name: "MFA Tester",
    email,
    password: PASSWORD,
    organizationName: `MFA Org ${unique()}`,
  });
  expect(response.status).toBe(201);
  return { token: response.body.data.token, email, userId: response.body.data.user.id };
}

/** Runs the two-step enrolment and returns the secret plus recovery codes. */
async function enrol(account: Account): Promise<{ secret: string; recoveryCodes: string[] }> {
  const begin = await request(app)
    .post("/api/v1/auth/mfa/enrol")
    .set("authorization", `Bearer ${account.token}`)
    .send({});
  expect(begin.status).toBe(200);
  const secret = begin.body.data.secret as string;

  const enable = await request(app)
    .post("/api/v1/auth/mfa/enable")
    .set("authorization", `Bearer ${account.token}`)
    .send({ code: generateCode(secret) });
  expect(enable.status).toBe(200);

  return { secret, recoveryCodes: enable.body.data.recoveryCodes as string[] };
}

const login = (email: string, password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

/**
 * A code from the step after the one enrolment consumed.
 *
 * Completing enrolment spends a step, and the replay guard refuses anything at
 * or below it. In use that is invisible — nobody signs in again inside the same
 * thirty seconds, and an authenticator visibly counts down to the next code —
 * but a test that runs in milliseconds hits it every time.
 */
const nextCode = (secret: string) => generateCode(secret, Date.now() + 30_000);

beforeAll(async () => {
  ({ app } = await import("../app.js"));
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  pool = database.pool;
  closePool = database.closePool;
  await migrations.migrate();
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Enrolment", () => {
  it("issues a secret and a scannable URI without enabling anything yet", async () => {
    const account = await newAccount();
    const begin = await request(app)
      .post("/api/v1/auth/mfa/enrol")
      .set("authorization", `Bearer ${account.token}`)
      .send({});

    expect(begin.body.data.otpauthUri).toContain("otpauth://totp/");
    expect(begin.body.data.otpauthUri).toContain(encodeURIComponent(account.email));

    // Critically, sign-in still works. Enabling on issue would lock out anyone
    // whose scan silently failed.
    const signIn = await login(account.email);
    expect(signIn.body.data.mfaRequired).toBeUndefined();
    expect(signIn.body.data.token).toBeTruthy();
  });

  it("refuses to complete enrolment with a wrong code", async () => {
    const account = await newAccount();
    await request(app).post("/api/v1/auth/mfa/enrol").set("authorization", `Bearer ${account.token}`).send({});

    const enable = await request(app)
      .post("/api/v1/auth/mfa/enable")
      .set("authorization", `Bearer ${account.token}`)
      .send({ code: "000000" });
    expect(enable.status).toBe(400);

    const status = await request(app).get("/api/v1/auth/mfa").set("authorization", `Bearer ${account.token}`);
    expect(status.body.data.enabled).toBe(false);
  });

  it("returns recovery codes once, and only once", async () => {
    const account = await newAccount();
    const { recoveryCodes } = await enrol(account);
    expect(recoveryCodes).toHaveLength(10);

    // They are stored hashed, so nothing can read them back.
    const stored = await pool.query<{ code_hash: string }>(
      "SELECT code_hash FROM mfa_recovery_codes WHERE user_id = $1",
      [account.userId],
    );
    expect(stored.rowCount).toBe(10);
    for (const row of stored.rows) {
      expect(recoveryCodes.some((code) => row.code_hash.includes(code))).toBe(false);
    }
  });

  it("stores the secret encrypted", async () => {
    const account = await newAccount();
    const { secret } = await enrol(account);

    const stored = await pool.query<{ mfa_secret_ciphertext: string }>(
      "SELECT mfa_secret_ciphertext FROM users WHERE id = $1",
      [account.userId],
    );
    // A database dump alone must not let someone mint valid codes.
    expect(stored.rows[0]!.mfa_secret_ciphertext).not.toContain(secret);
  });
});

describe("Sign-in", () => {
  it("does not issue a session for a correct password alone", async () => {
    const account = await newAccount();
    await enrol(account);

    const signIn = await login(account.email);
    expect(signIn.status).toBe(200);
    expect(signIn.body.data.mfaRequired).toBe(true);
    // The whole point: no token, no refresh token, nothing usable.
    expect(signIn.body.data.token).toBeUndefined();
    expect(signIn.body.data.refreshToken).toBeUndefined();
    expect(signIn.body.data.challengeToken).toBeTruthy();
  });

  it("completes with a valid code", async () => {
    const account = await newAccount();
    const { secret } = await enrol(account);
    const signIn = await login(account.email);

    const verify = await request(app).post("/api/v1/auth/mfa/verify").send({
      challengeToken: signIn.body.data.challengeToken,
      code: nextCode(secret),
    });
    expect(verify.status).toBe(200);
    expect(verify.body.data.token).toBeTruthy();
    expect(verify.body.data.organizations.length).toBeGreaterThan(0);
  });

  it("refuses a wrong code", async () => {
    const account = await newAccount();
    await enrol(account);
    const signIn = await login(account.email);

    const verify = await request(app).post("/api/v1/auth/mfa/verify").send({
      challengeToken: signIn.body.data.challengeToken,
      code: "000000",
    });
    expect(verify.status).toBe(401);
  });

  it("refuses a code that was already used", async () => {
    const account = await newAccount();
    const { secret } = await enrol(account);
    const code = nextCode(secret);

    const first = await login(account.email);
    const firstVerify = await request(app).post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: first.body.data.challengeToken, code });
    expect(firstVerify.status).toBe(200);

    // Someone who observes a code — over a shoulder, in a screenshare, from a
    // phished form — must not be able to use it inside its window.
    const second = await login(account.email);
    const replay = await request(app).post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: second.body.data.challengeToken, code });
    expect(replay.status).toBe(401);
  });

  it("refuses an access token in place of a challenge token", async () => {
    const account = await newAccount();
    const { secret } = await enrol(account);

    // The tokens have different audiences precisely so this cannot work.
    const verify = await request(app).post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: account.token, code: generateCode(secret) });
    expect(verify.status).toBe(401);
  });

  it("refuses a challenge token for a different account", async () => {
    const victim = await newAccount();
    const { secret } = await enrol(victim);
    const attacker = await newAccount();

    const attackerSignIn = await login(attacker.email);
    const verify = await request(app).post("/api/v1/auth/mfa/verify").send({
      challengeToken: attackerSignIn.body.data.challengeToken,
      code: generateCode(secret),
    });
    // The attacker has no second factor enrolled, so their challenge cannot be
    // satisfied by the victim's code.
    expect(verify.status).toBe(400);
  });
});

describe("Recovery codes", () => {
  it("signs in with one, and spends it", async () => {
    const account = await newAccount();
    const { recoveryCodes } = await enrol(account);
    const code = recoveryCodes[0]!;

    const first = await login(account.email);
    const used = await request(app).post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: first.body.data.challengeToken, code });
    expect(used.status).toBe(200);
    expect(used.body.data.usedRecoveryCode).toBe(true);
    expect(used.body.data.remainingRecoveryCodes).toBe(9);

    const second = await login(account.email);
    const reuse = await request(app).post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: second.body.data.challengeToken, code });
    expect(reuse.status).toBe(401);
  });

  it("accepts one however it was typed", async () => {
    const account = await newAccount();
    const { recoveryCodes } = await enrol(account);

    const signIn = await login(account.email);
    const verify = await request(app).post("/api/v1/auth/mfa/verify").send({
      challengeToken: signIn.body.data.challengeToken,
      // Lowercase, dash removed: someone reading it off a printout.
      code: recoveryCodes[1]!.toLowerCase().replace("-", ""),
    });
    expect(verify.status).toBe(200);
  });

  it("replaces the whole set when regenerated", async () => {
    const account = await newAccount();
    const { secret, recoveryCodes } = await enrol(account);

    const regenerated = await request(app)
      .post("/api/v1/auth/mfa/recovery-codes")
      .set("authorization", `Bearer ${account.token}`)
      .send({ code: nextCode(secret) });
    expect(regenerated.status).toBe(200);

    // The old ones must stop working, or regenerating would widen access
    // rather than replace it.
    const signIn = await login(account.email);
    const old = await request(app).post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: signIn.body.data.challengeToken, code: recoveryCodes[0]! });
    expect(old.status).toBe(401);
  });
});

describe("Disabling", () => {
  it("requires the password and a current code", async () => {
    const account = await newAccount();
    const { secret } = await enrol(account);

    // A hijacked session alone must not be able to strip the protection.
    const withoutPassword = await request(app)
      .post("/api/v1/auth/mfa/disable")
      .set("authorization", `Bearer ${account.token}`)
      .send({ password: "wrong-password", code: nextCode(secret) });
    expect(withoutPassword.status).toBe(401);

    const withoutCode = await request(app)
      .post("/api/v1/auth/mfa/disable")
      .set("authorization", `Bearer ${account.token}`)
      .send({ password: PASSWORD, code: "000000" });
    expect(withoutCode.status).toBe(400);

    const stillOn = await request(app).get("/api/v1/auth/mfa").set("authorization", `Bearer ${account.token}`);
    expect(stillOn.body.data.enabled).toBe(true);
  });

  it("clears the secret and the recovery codes when it does succeed", async () => {
    const account = await newAccount();
    const { secret } = await enrol(account);

    const disabled = await request(app)
      .post("/api/v1/auth/mfa/disable")
      .set("authorization", `Bearer ${account.token}`)
      .send({ password: PASSWORD, code: nextCode(secret) });
    expect(disabled.status).toBe(200);

    const row = await pool.query<{ mfa_enabled: boolean; mfa_secret_ciphertext: string | null }>(
      "SELECT mfa_enabled, mfa_secret_ciphertext FROM users WHERE id = $1",
      [account.userId],
    );
    expect(row.rows[0]!.mfa_enabled).toBe(false);
    // Left behind, the secret would still generate valid codes if the column
    // were ever read again.
    expect(row.rows[0]!.mfa_secret_ciphertext).toBeNull();

    const codes = await pool.query("SELECT 1 FROM mfa_recovery_codes WHERE user_id = $1", [account.userId]);
    expect(codes.rowCount).toBe(0);

    const signIn = await login(account.email);
    expect(signIn.body.data.token).toBeTruthy();
  });
});
