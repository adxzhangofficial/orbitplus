import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PoolClient } from "pg";
import { encryptFileVersionContent } from "../services/file-version-crypto.js";
import { closePool, pool } from "./pool.js";
import { expectedMigrationNames, migrationsDirectory } from "./schema.js";

async function backfillEncryptedFileVersions(client: PoolClient): Promise<void> {
  while (true) {
    const legacy = await client.query<{
      id: string;
      organization_id: string;
      server_id: string;
      path: string;
      checksum: string;
      content: Buffer;
    }>(`SELECT id, organization_id, server_id, path, checksum, content
          FROM file_versions
         WHERE content_ciphertext IS NULL AND content IS NOT NULL
         ORDER BY id
         LIMIT 100
         FOR UPDATE`);
    if (legacy.rows.length === 0) break;

    for (const version of legacy.rows) {
      const ciphertext = encryptFileVersionContent(version.content, {
        organizationId: version.organization_id,
        serverId: version.server_id,
        path: version.path,
        checksum: version.checksum,
      });
      await client.query(
        "UPDATE file_versions SET content_ciphertext = $2, content = NULL WHERE id = $1 AND content_ciphertext IS NULL",
        [version.id, ciphertext],
      );
    }
  }
}

export async function migrate(): Promise<void> {
  const files = await expectedMigrationNames();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('orbit-schema-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const file of files) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (applied.rowCount) continue;
      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      await client.query("BEGIN");
      try {
        // Recover safely if an interrupted/manual deployment recorded 002 but did
        // not run its application-layer encryption hook before 003.
        if (file === "003_require_encrypted_file_versions.sql") {
          await backfillEncryptedFileVersions(client);
        }
        await client.query(sql);
        if (file === "002_encrypt_file_versions.sql") {
          await backfillEncryptedFileVersions(client);
        }
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
        await client.query("COMMIT");
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('orbit-schema-migrations'))").catch(() => undefined);
    client.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then(() => console.log("Database migrations complete"))
    .catch((error) => {
      console.error("Database migration failed", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closePool);
}
