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
  LOG_LEVEL: z.enum(["silent", "error", "warn", "info", "debug"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid backend environment variables: ${fields}`);
}

export const env = parsed.data;
