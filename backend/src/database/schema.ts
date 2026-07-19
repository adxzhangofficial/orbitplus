import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { AppError } from "../lib/errors.js";

export const migrationsDirectory = fileURLToPath(new URL("./migrations", import.meta.url));

export async function expectedMigrationNames(): Promise<string[]> {
  const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  if (files.length === 0) {
    throw new AppError(503, "SCHEMA_NOT_READY", "No packaged database migrations were found");
  }
  return files;
}

export async function assertSchemaReady(): Promise<{ appliedMigrations: number; latestMigration: string }> {
  const expected = await expectedMigrationNames();
  const ledger = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
  );
  if (!ledger.rows[0]?.exists) {
    throw new AppError(503, "SCHEMA_NOT_READY", "Database migrations have not been applied");
  }

  const applied = await pool.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
  const appliedNames = new Set(applied.rows.map((row) => row.name));
  const missing = expected.filter((name) => !appliedNames.has(name));
  if (missing.length > 0) {
    throw new AppError(503, "SCHEMA_NOT_READY", `Pending database migrations: ${missing.join(", ")}`);
  }
  const packagedNames = new Set(expected);
  const unknown = applied.rows.map((row) => row.name).filter((name) => !packagedNames.has(name));
  if (unknown.length > 0) {
    throw new AppError(503, "SCHEMA_NOT_READY", `Database schema is newer than this release: ${unknown.join(", ")}`);
  }

  const requiredObjects = await pool.query<{
    users: boolean;
    organizations: boolean;
    servers: boolean;
    fileVersions: boolean;
    encryptedVersions: boolean;
  }>(`SELECT
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.organizations') IS NOT NULL AS organizations,
        to_regclass('public.server_connections') IS NOT NULL AS servers,
        to_regclass('public.file_versions') IS NOT NULL AS "fileVersions",
        EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'file_versions' AND column_name = 'content_ciphertext'
        ) AS "encryptedVersions"`);
  const objects = requiredObjects.rows[0];
  if (!objects || Object.values(objects).some((exists) => !exists)) {
    throw new AppError(503, "SCHEMA_NOT_READY", "The database schema is incomplete");
  }

  return { appliedMigrations: expected.length, latestMigration: expected.at(-1)! };
}
