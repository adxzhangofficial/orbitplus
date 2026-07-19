import { Router } from "express";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { signAccessToken } from "../lib/jwt.js";
import { authenticate } from "../middleware/auth.js";

const slugSuffix = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  organizationName: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

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

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT 1 FROM users WHERE lower(email) = $1", [input.email]);
      if (existing.rowCount) throw conflict("An account with this email already exists");
      const passwordHash = await bcrypt.hash(input.password, 12);
      const userResult = await client.query<{ id: string; email: string; name: string; platform_role: "user" }>(
        `INSERT INTO users(email, password_hash, name, email_verified)
         VALUES($1, $2, $3, true) RETURNING id, email, name, platform_role`,
        [input.email, passwordHash, input.name],
      );
      const user = userResult.rows[0]!;
      const organizationResult = await client.query<{ id: string; name: string; slug: string; plan: string }>(
        `INSERT INTO organizations(name, slug, plan) VALUES($1, $2, 'free') RETURNING id, name, slug, plan`,
        [input.organizationName, slugify(input.organizationName)],
      );
      const organization = organizationResult.rows[0]!;
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
      const token = signAccessToken({ sub: user.id, email: user.email, platformRole: "user" });
      response.status(201).json({ data: { token, user, organizations: [{ ...organization, role: "owner" }] } });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
    }>("SELECT id, email, name, password_hash, platform_role, active FROM users WHERE lower(email) = $1", [input.email]);
    const user = result.rows[0];
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.password_hash))) {
      throw unauthorized("Email or password is incorrect");
    }
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    const token = signAccessToken({ sub: user.id, email: user.email, platformRole: user.platform_role });
    const organizations = await organizationsForUser(user.id);
    response.json({
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, platformRole: user.platform_role },
        organizations,
      },
    });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      "SELECT id, email, name, platform_role AS \"platformRole\", email_verified AS \"emailVerified\", last_login_at AS \"lastLoginAt\", created_at AS \"createdAt\" FROM users WHERE id = $1",
      [request.auth!.userId],
    );
    const organizations = await organizationsForUser(request.auth!.userId);
    response.json({ data: { user: result.rows[0], organizations } });
  }),
);

// Access tokens are stateless. This authenticated endpoint gives clients a
// consistent logout contract; the client destroys its token after the 204.
authRouter.post("/logout", authenticate, (_request, response) => {
  response.status(204).send();
});
