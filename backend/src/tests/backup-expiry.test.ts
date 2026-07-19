import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
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

/**
 * Retention on snapshots.
 *
 * Every backup was created with a retention_until that nothing enforced, so
 * stored bytes grew without bound. The cases that matter are the ones where the
 * sweep could destroy something: a snapshot inside its window, and one being
 * restored right now.
 */

const backupRoot = fileURLToPath(new URL("../../storage/backups", import.meta.url));

let pool: import("pg").Pool;
let closePool: () => Promise<void>;
let organizationId = "";
let serverId = "";

async function makeBackup(input: { retentionUntil: string | null; status?: string }): Promise<{ id: string; storageKey: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO backups(organization_id, server_id, name, root_path, type, status, size_bytes, file_count, retention_until)
     VALUES($1,$2,$3,'/','full',$4,1024,3,$5) RETURNING id`,
    [organizationId, serverId, `Expiry probe ${Date.now()}${Math.random()}`, input.status ?? "completed", input.retentionUntil],
  );
  const id = result.rows[0]!.id;
  const storageKey = path.join(organizationId, `${id}.orbitbk`);
  await mkdir(path.join(backupRoot, organizationId), { recursive: true });
  await writeFile(path.join(backupRoot, storageKey), "probe", { mode: 0o600 });
  await pool.query("UPDATE backups SET storage_key = $2 WHERE id = $1", [id, storageKey]);
  return { id, storageKey };
}

async function exists(storageKey: string): Promise<boolean> {
  return readFile(path.join(backupRoot, storageKey)).then(() => true, () => false);
}

beforeAll(async () => {
  await import("../app.js");
  const database = await import("../database/pool.js");
  const migrations = await import("../database/migrate.js");
  const seeding = await import("../database/seed.js");
  pool = database.pool;
  closePool = database.closePool;
  await migrations.migrate();
  await seeding.seed();

  // Chosen together: other suites create organizations with no servers, and
  // backups need both.
  const server = await pool.query<{ id: string; organization_id: string }>(
    "SELECT id, organization_id FROM server_connections LIMIT 1",
  );
  serverId = server.rows[0]!.id;
  organizationId = server.rows[0]!.organization_id;
}, 60_000);

afterAll(async () => {
  if (closePool) await closePool();
});

describe("Backup expiry", () => {
  it("removes the row and the stored bytes once the window has passed", async () => {
    const backup = await makeBackup({ retentionUntil: new Date(Date.now() - 86_400_000).toISOString() });

    const { runBackupExpiry } = await import("../workers/maintenance.worker.js");
    const result = await runBackupExpiry();
    expect(result.expired).toBeGreaterThan(0);

    const row = await pool.query("SELECT 1 FROM backups WHERE id = $1", [backup.id]);
    expect(row.rowCount).toBe(0);
    // A row without its file is a broken restore; a file without its row is
    // orphaned forever. Both have to go.
    expect(await exists(backup.storageKey)).toBe(false);
  });

  it("leaves a snapshot inside its retention window alone", async () => {
    const backup = await makeBackup({ retentionUntil: new Date(Date.now() + 86_400_000).toISOString() });

    const { runBackupExpiry } = await import("../workers/maintenance.worker.js");
    await runBackupExpiry();

    const row = await pool.query("SELECT 1 FROM backups WHERE id = $1", [backup.id]);
    expect(row.rowCount).toBe(1);
    expect(await exists(backup.storageKey)).toBe(true);

    await pool.query("DELETE FROM backups WHERE id = $1", [backup.id]);
  });

  it("never deletes a snapshot that is being restored", async () => {
    const backup = await makeBackup({
      retentionUntil: new Date(Date.now() - 86_400_000).toISOString(),
      status: "restoring",
    });

    const { runBackupExpiry } = await import("../workers/maintenance.worker.js");
    await runBackupExpiry();

    // Deleting the source of a running restore is the one way this sweep could
    // destroy data someone is actively relying on.
    const row = await pool.query("SELECT 1 FROM backups WHERE id = $1", [backup.id]);
    expect(row.rowCount).toBe(1);
    expect(await exists(backup.storageKey)).toBe(true);

    await pool.query("DELETE FROM backups WHERE id = $1", [backup.id]);
  });

  it("keeps a backup with no retention set", async () => {
    const backup = await makeBackup({ retentionUntil: null });

    const { runBackupExpiry } = await import("../workers/maintenance.worker.js");
    await runBackupExpiry();

    const row = await pool.query("SELECT 1 FROM backups WHERE id = $1", [backup.id]);
    expect(row.rowCount).toBe(1);

    await pool.query("DELETE FROM backups WHERE id = $1", [backup.id]);
  });

  it("refuses a storage key that points outside the backup root", async () => {
    const { deleteSnapshot } = await import("../services/backup.service.js");
    // The key comes from a database row, and a row is not a reason to delete an
    // arbitrary path on the host.
    expect(await deleteSnapshot("../../../etc/passwd")).toBe(false);
    expect(await deleteSnapshot("/etc/passwd")).toBe(false);
  });
});
