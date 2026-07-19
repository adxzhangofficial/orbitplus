import { withAdapter } from "../adapters/index.js";
import { pool } from "../database/pool.js";
import type { BackupJob } from "../queue/index.js";
import { createSnapshot, restoreSnapshot } from "../services/backup.service.js";
import { serverForTenant } from "../services/server.service.js";

export async function runBackup(job: BackupJob): Promise<void> {
  const claimed = await pool.query(
    `UPDATE backups SET status = 'running', started_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'scheduled')
      RETURNING id`,
    [job.backupId, job.organizationId],
  );
  if (!claimed.rowCount) return;

  try {
    const server = await serverForTenant(job.organizationId, job.serverId);
    const snapshot = await withAdapter(server, (adapter) =>
      createSnapshot(job.organizationId, job.backupId, job.rootPath, adapter),
    );
    await pool.query(
      `UPDATE backups SET status = 'completed', storage_key = $2, size_bytes = $3,
              file_count = $4, completed_at = now(), error_message = NULL
        WHERE id = $1`,
      [job.backupId, snapshot.storageKey, snapshot.sizeBytes, snapshot.fileCount],
    );
  } catch (error) {
    await pool.query(
      "UPDATE backups SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1",
      [job.backupId, error instanceof Error ? error.message.slice(0, 1000) : "Backup failed"],
    );
    throw error;
  }
}

export async function runRestore(job: BackupJob & { storageKey: string }): Promise<void> {
  const server = await serverForTenant(job.organizationId, job.serverId);
  await withAdapter(server, (adapter) => restoreSnapshot(job.storageKey, adapter));
  await pool.query("UPDATE backups SET last_restored_at = now() WHERE id = $1", [job.backupId]);
}
