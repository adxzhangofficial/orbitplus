import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { conflict, notFound } from "../lib/errors.js";
import { issueAuthToken } from "../services/auth-token.service.js";
import { sendVerificationEmail } from "../services/email.service.js";
import { env } from "../config/env.js";

/**
 * The signed-in person's own profile.
 *
 * Mounted outside the tenant router: these fields belong to the user across
 * every organization they are a member of, not to whichever one is currently
 * selected.
 */

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  locale: z.string().trim().max(16).optional(),
  dateFormat: z.string().trim().max(32).optional(),
  preferences: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
  // Covers announcement email only. Password resets and security notices are
  // transactional and are never suppressed by a marketing preference.
  announcementEmailOptOut: z.boolean().optional(),
}).strict();

const SELECT = `id, name, email, job_title AS "jobTitle", timezone, locale,
  date_format AS "dateFormat", preferences, email_verified AS "emailVerified",
  mfa_enabled AS "mfaEnabled", platform_role AS "platformRole",
  announcement_email_opt_out AS "announcementEmailOptOut",
  last_login_at AS "lastLoginAt", created_at AS "createdAt"`;

export const profileRouter = Router();

profileRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(`SELECT ${SELECT} FROM users WHERE id = $1`, [request.auth!.userId]);
    if (!result.rows[0]) throw notFound("User");
    response.json({ data: result.rows[0] });
  }),
);

profileRouter.patch(
  "/",
  asyncHandler(async (request, response) => {
    const input = profileSchema.parse(request.body);

    // Changing an address re-opens verification: the new one has not been
    // proven to belong to this person, and password reset is delivered there.
    let emailChanged = false;
    if (input.email) {
      const existing = await pool.query(
        "SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2",
        [input.email, request.auth!.userId],
      );
      if (existing.rowCount) throw conflict("Another account already uses that email address");
      const current = await pool.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [request.auth!.userId]);
      emailChanged = current.rows[0]?.email.toLowerCase() !== input.email;
    }

    const result = await pool.query(
      `UPDATE users SET
         name = COALESCE($2, name),
         email = COALESCE($3, email),
         email_verified = CASE WHEN $4::boolean THEN false ELSE email_verified END,
         job_title = CASE WHEN $5::boolean THEN $6 ELSE job_title END,
         timezone = COALESCE($7, timezone),
         locale = COALESCE($8, locale),
         date_format = COALESCE($9, date_format),
         preferences = COALESCE($10::jsonb, preferences),
         announcement_email_opt_out = COALESCE($11, announcement_email_opt_out),
         updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT}`,
      [
        request.auth!.userId,
        input.name ?? null,
        input.email ?? null,
        emailChanged,
        Object.hasOwn(input, "jobTitle"),
        input.jobTitle ?? null,
        input.timezone ?? null,
        input.locale ?? null,
        input.dateFormat ?? null,
        input.preferences ? JSON.stringify(input.preferences) : null,
        input.announcementEmailOptOut ?? null,
      ],
    );
    if (!result.rows[0]) throw notFound("User");

    if (emailChanged && input.email) {
      const token = await issueAuthToken(request.auth!.userId, "email_verification", env.EMAIL_VERIFICATION_TTL_HOURS * 3_600_000, request);
      await sendVerificationEmail(input.email, token, env.EMAIL_VERIFICATION_TTL_HOURS);
    }

    response.json({
      data: result.rows[0],
      meta: emailChanged ? { emailVerificationSent: true } : undefined,
    });
  }),
);
