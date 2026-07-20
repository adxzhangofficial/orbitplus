import { Router } from "express";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { env } from "../config/env.js";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors.js";
import { signAccessToken, signChallengeToken, verifyChallengeToken } from "../lib/jwt.js";
import * as mfa from "../services/mfa.service.js";
import { routeParam } from "../lib/route-param.js";
import { authenticate } from "../middleware/auth.js";
import { consumeAuthToken, issueAuthToken } from "../services/auth-token.service.js";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/email.service.js";
import {
  createSession,
  listSessions,
  revokeAllSessions,
  revokeSession,
  revokeSessionById,
  rotateSession,
} from "../services/session.service.js";

const slugSuffix = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

const passwordField = z.string().min(10).max(128);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: passwordField,
  organizationName: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

const emailOnlySchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

const tokenSchema = z.object({ token: z.string().min(10).max(500) });

const resetSchema = tokenSchema.extend({ password: passwordField });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordField,
});

const refreshSchema = z.object({ refreshToken: z.string().min(10).max(500) });

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "workspace"}-${slugSuffix()}`;
}

async function organizationsForUser(userId: string) {
  const result = await pool.query(
    `SELECT o.id, o.name, o.slug, o.plan, o.status, m.role
       FROM memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.status = 'active' ORDER BY o.name`,
    [userId],
  );
  return result.rows;
}

const verificationTtlMs = () => env.EMAIL_VERIFICATION_TTL_HOURS * 3_600_000;
const resetTtlMs = () => env.PASSWORD_RESET_TTL_MINUTES * 60_000;

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const client = await pool.connect();
    let userId: string;
    let user: { id: string; email: string; name: string; platform_role: "user" };
    let organization: { id: string; name: string; slug: string; plan: string };
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT 1 FROM users WHERE lower(email) = $1", [input.email]);
      if (existing.rowCount) throw conflict("An account with this email already exists");
      const passwordHash = await bcrypt.hash(input.password, 12);
      const userResult = await client.query<{ id: string; email: string; name: string; platform_role: "user" }>(
        `INSERT INTO users(email, password_hash, name, email_verified)
         VALUES($1, $2, $3, false) RETURNING id, email, name, platform_role`,
        [input.email, passwordHash, input.name],
      );
      user = userResult.rows[0]!;
      userId = user.id;
      const organizationResult = await client.query<{ id: string; name: string; slug: string; plan: string }>(
        `INSERT INTO organizations(name, slug, plan) VALUES($1, $2, 'free') RETURNING id, name, slug, plan`,
        [input.organizationName, slugify(input.organizationName)],
      );
      organization = organizationResult.rows[0]!;
      await client.query(
        "INSERT INTO memberships(organization_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
        [organization.id, user.id],
      );
      await client.query(
        `INSERT INTO workspaces(organization_id, name, slug, description, environment, created_by)
         VALUES($1, 'Primary workspace', 'primary', 'Default server workspace', 'production', $2)`,
        [organization.id, user.id],
      );
      await client.query(
        "INSERT INTO subscriptions(organization_id, plan, amount_cents) VALUES($1, 'free', 0)",
        [organization.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const verificationToken = await issueAuthToken(userId, "email_verification", verificationTtlMs(), request);
    await sendVerificationEmail(user.email, verificationToken, env.EMAIL_VERIFICATION_TTL_HOURS);
    const token = signAccessToken({ sub: user.id, email: user.email, platformRole: "user" });
    const refreshToken = await createSession(user.id, request);
    response.status(201).json({
      data: {
        token,
        refreshToken,
        user: { ...user, emailVerified: false },
        organizations: [{ ...organization, role: "owner" }],
      },
    });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await pool.query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      platform_role: "user" | "admin";
      active: boolean;
      email_verified: boolean;
      mfa_enabled: boolean;
    }>(
      `SELECT id, email, name, password_hash, platform_role, active, email_verified, mfa_enabled
         FROM users WHERE lower(email) = $1`,
      [input.email],
    );
    const user = result.rows[0];
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.password_hash))) {
      throw unauthorized("Email or password is incorrect");
    }

    // A correct password is not a session when a second factor is enrolled.
    // The challenge token proves only that this step passed: it carries no role
    // and no email, has its own audience, and cannot be presented anywhere an
    // access token is expected.
    if (user.mfa_enabled) {
      response.json({ data: { mfaRequired: true, challengeToken: signChallengeToken(user.id) } });
      return;
    }

    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    const token = signAccessToken({ sub: user.id, email: user.email, platformRole: user.platform_role });
    const refreshToken = await createSession(user.id, request);
    const organizations = await organizationsForUser(user.id);
    response.json({
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platform_role,
          emailVerified: user.email_verified,
        },
        organizations,
      },
    });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (request, response) => {
    const input = refreshSchema.parse(request.body);
    const { userId, token: refreshToken } = await rotateSession(input.refreshToken, request);
    const result = await pool.query<{
      id: string; email: string; name: string; platform_role: "user" | "admin"; active: boolean; email_verified: boolean;
    }>(
      "SELECT id, email, name, platform_role, active, email_verified FROM users WHERE id = $1",
      [userId],
    );
    const user = result.rows[0];
    if (!user?.active) throw unauthorized("This account is unavailable");
    const token = signAccessToken({ sub: user.id, email: user.email, platformRole: user.platform_role });
    response.json({
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platform_role,
          emailVerified: user.email_verified,
        },
      },
    });
  }),
);

/**
 * Always reports success. Distinguishing a known from an unknown address here
 * would turn this endpoint into an account-existence oracle.
 */
authRouter.post(
  "/forgot-password",
  asyncHandler(async (request, response) => {
    const input = emailOnlySchema.parse(request.body);
    const result = await pool.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE lower(email) = $1 AND active = true",
      [input.email],
    );
    const user = result.rows[0];
    if (user) {
      const token = await issueAuthToken(user.id, "password_reset", resetTtlMs(), request);
      await sendPasswordResetEmail(user.email, token, env.PASSWORD_RESET_TTL_MINUTES);
    }
    response.json({
      data: { message: "If an account exists for that address, a reset link has been sent." },
    });
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (request, response) => {
    const input = resetSchema.parse(request.body);
    const userId = await consumeAuthToken(input.token, "password_reset");
    if (!userId) throw badRequest("This reset link is invalid or has expired. Request a new one.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    await pool.query(
      "UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1",
      [userId, passwordHash],
    );
    // A reset is the recovery path for a possibly compromised account, so every
    // existing session is ended rather than only the requesting one.
    await revokeAllSessions(userId, "password_reset");
    const emailResult = await pool.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
    if (emailResult.rows[0]) await sendPasswordChangedEmail(emailResult.rows[0].email);
    response.json({ data: { message: "Your password has been updated. Sign in with your new password." } });
  }),
);

authRouter.post(
  "/verify-email",
  asyncHandler(async (request, response) => {
    const input = tokenSchema.parse(request.body);
    const userId = await consumeAuthToken(input.token, "email_verification");
    if (!userId) throw badRequest("This confirmation link is invalid or has expired. Request a new one.");
    await pool.query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1", [userId]);
    response.json({ data: { message: "Your email address has been confirmed.", emailVerified: true } });
  }),
);

authRouter.post(
  "/resend-verification",
  authenticate,
  asyncHandler(async (request, response) => {
    const result = await pool.query<{ email: string; email_verified: boolean }>(
      "SELECT email, email_verified FROM users WHERE id = $1",
      [request.auth!.userId],
    );
    const user = result.rows[0];
    if (!user) throw notFound("User");
    if (!user.email_verified) {
      const token = await issueAuthToken(request.auth!.userId, "email_verification", verificationTtlMs(), request);
      await sendVerificationEmail(user.email, token, env.EMAIL_VERIFICATION_TTL_HOURS);
    }
    response.json({ data: { message: "A confirmation email is on its way if your address is unverified." } });
  }),
);

authRouter.post(
  "/change-password",
  authenticate,
  asyncHandler(async (request, response) => {
    const input = changePasswordSchema.parse(request.body);
    const result = await pool.query<{ password_hash: string; email: string }>(
      "SELECT password_hash, email FROM users WHERE id = $1",
      [request.auth!.userId],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.currentPassword, user.password_hash))) {
      throw unauthorized("Your current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await pool.query(
      "UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1",
      [request.auth!.userId, passwordHash],
    );
    // The caller keeps its own session; every other device is signed out.
    const currentRefresh = typeof request.body?.refreshToken === "string" ? request.body.refreshToken : undefined;
    await revokeAllSessions(request.auth!.userId, "password_changed", currentRefresh);
    await sendPasswordChangedEmail(user.email);
    response.json({ data: { message: "Your password has been updated." } });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT id, email, name, platform_role AS "platformRole", email_verified AS "emailVerified",
              mfa_enabled AS "mfaEnabled", last_login_at AS "lastLoginAt", created_at AS "createdAt"
         FROM users WHERE id = $1`,
      [request.auth!.userId],
    );
    const organizations = await organizationsForUser(request.auth!.userId);
    response.json({ data: { user: result.rows[0], organizations } });
  }),
);

authRouter.get(
  "/sessions",
  authenticate,
  asyncHandler(async (request, response) => {
    const current = request.header("x-refresh-token") ?? undefined;
    response.json({ data: await listSessions(request.auth!.userId, current) });
  }),
);

authRouter.delete(
  "/sessions/:id",
  authenticate,
  asyncHandler(async (request, response) => {
    const revoked = await revokeSessionById(request.auth!.userId, routeParam(request, "id"));
    if (!revoked) throw notFound("Session");
    response.status(204).send();
  }),
);

authRouter.post(
  "/logout",
  authenticate,
  asyncHandler(async (request, response) => {
    const refreshToken = typeof request.body?.refreshToken === "string" ? request.body.refreshToken : undefined;
    if (refreshToken) await revokeSession(refreshToken);
    response.status(204).send();
  }),
);

/* --------------------------------------------------------------------------
 * Two-factor authentication
 * ------------------------------------------------------------------------ */

/**
 * Completes a sign-in that stopped for a second factor.
 *
 * The challenge token is what proves the password step already passed, so this
 * route never sees a password and cannot be used to guess one. Rate limiting on
 * /auth applies here too, which is what bounds guessing a six-digit code.
 */
authRouter.post(
  "/mfa/verify",
  asyncHandler(async (request, response) => {
    const input = z.object({
      challengeToken: z.string().min(10),
      code: z.string().trim().min(6).max(20),
    }).parse(request.body);

    const claims = verifyChallengeToken(input.challengeToken);
    const outcome = await mfa.verifyChallenge(claims.sub, input.code);
    if (!outcome.ok) throw unauthorized("That code is not valid");

    const result = await pool.query<{
      id: string; email: string; name: string; platform_role: "user" | "admin";
      active: boolean; email_verified: boolean;
    }>(
      "SELECT id, email, name, platform_role, active, email_verified FROM users WHERE id = $1",
      [claims.sub],
    );
    const user = result.rows[0];
    if (!user?.active) throw unauthorized("This account is unavailable");

    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    const token = signAccessToken({ sub: user.id, email: user.email, platformRole: user.platform_role });
    const refreshToken = await createSession(user.id, request);

    response.json({
      data: {
        token,
        refreshToken,
        user: {
          id: user.id, email: user.email, name: user.name,
          platformRole: user.platform_role, emailVerified: user.email_verified,
        },
        organizations: await organizationsForUser(user.id),
        // Surfaced so the interface can prompt for a fresh set before someone
        // runs out and locks themselves out.
        ...(outcome.usedRecoveryCode
          ? { usedRecoveryCode: true, remainingRecoveryCodes: outcome.remainingRecoveryCodes }
          : {}),
      },
    });
  }),
);

authRouter.post(
  "/mfa/enrol",
  authenticate,
  asyncHandler(async (request, response) => {
    const result = await mfa.beginEnrolment(request.auth!.userId, request.auth!.email);
    response.json({ data: result });
  }),
);

authRouter.post(
  "/mfa/enable",
  authenticate,
  asyncHandler(async (request, response) => {
    const input = z.object({ code: z.string().trim().min(6).max(10) }).parse(request.body);
    const recoveryCodes = await mfa.completeEnrolment(request.auth!.userId, input.code);
    // Returned once and never readable again; they are stored hashed.
    response.json({ data: { enabled: true, recoveryCodes } });
  }),
);

authRouter.post(
  "/mfa/disable",
  authenticate,
  asyncHandler(async (request, response) => {
    const input = z.object({
      password: z.string().min(1),
      code: z.string().trim().min(6).max(20),
    }).parse(request.body);
    await mfa.disable(request.auth!.userId, input.password, input.code);
    response.json({ data: { enabled: false } });
  }),
);

authRouter.post(
  "/mfa/recovery-codes",
  authenticate,
  asyncHandler(async (request, response) => {
    const input = z.object({ code: z.string().trim().min(6).max(20) }).parse(request.body);
    const recoveryCodes = await mfa.regenerateRecoveryCodes(request.auth!.userId, input.code);
    response.json({ data: { recoveryCodes } });
  }),
);

authRouter.get(
  "/mfa",
  authenticate,
  asyncHandler(async (request, response) => {
    const result = await pool.query<{ mfa_enabled: boolean; mfa_enrolled_at: Date | null }>(
      "SELECT mfa_enabled, mfa_enrolled_at FROM users WHERE id = $1",
      [request.auth!.userId],
    );
    response.json({
      data: {
        enabled: result.rows[0]?.mfa_enabled ?? false,
        enrolledAt: result.rows[0]?.mfa_enrolled_at ?? null,
        remainingRecoveryCodes: await mfa.countRecoveryCodes(request.auth!.userId),
      },
    });
  }),
);
