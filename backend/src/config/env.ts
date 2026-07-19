import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4400),
  FRONTEND_URL: z.string().default("http://127.0.0.1:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  DEMO_MODE: z.string().default("true").transform((value) => value === "true"),
  ALLOW_DEVELOPMENT_SEED: z.string().default("false").transform((value) => value === "true"),
  SEED_DATABASE_NAME: z.string().min(1).optional(),
  SFTP_ALLOW_PRIVATE_NETWORKS: z.string().default("false").transform((value) => value === "true"),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  // Uploads bypass the editor's version-history path, so they are allowed to be
  // considerably larger than a file the browser will render in an editor.
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  // Contents at or below this size are versioned on upload. Larger uploads are
  // recorded by checksum only, so a video does not enter version history.
  MAX_VERSIONED_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  LOG_LEVEL: z.enum(["silent", "error", "warn", "info", "debug"]).default("info"),

  // Canonical public origin used to build emailed links. FRONTEND_URL may hold
  // several comma-separated CORS origins, which is not usable for a link.
  APP_URL: z.string().url().optional(),
  // Without an API key the transport logs the message instead of sending, so
  // local development exercises the full flow with no external dependency.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default("Orbit+ <onboarding@resend.dev>"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid backend environment variables: ${fields}`);
}

export const env = parsed.data;

/** Origin used to build emailed links, falling back to the first CORS origin. */
export const appUrl: string = (env.APP_URL ?? env.FRONTEND_URL.split(",")[0]!.trim()).replace(/\/+$/, "");
