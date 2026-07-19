import { withAdapter } from "../adapters/index.js";
import { pool } from "../database/pool.js";
import type { BackupJob } from "../queue/index.js";
import { createSnapshot, restoreSnapshot } from "../services/backup.service.js";
import { serverForTenant } from "../services/server.service.js";
import { dispatchEvent } from "../services/integration.service.js";

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
    await dispatchEvent({
      event: "backup.completed",
      organizationId: job.organizationId,
      title: "Backup completed",
      message: `${snapshot.fileCount} files captured from ${server.name}.`,
      severity: "success",
      resource: { type: "backup", id: job.backupId, name: server.name },
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
  } catch (error) {
    await pool.query(
      "UPDATE backups SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1",
      [job.backupId, error instanceof Error ? error.message.slice(0, 1000) : "Backup failed"],
    );
    // A failed backup is the case most worth telling someone about: nobody
    // discovers it until they need to restore.
    await dispatchEvent({
      event: "backup.failed",
      organizationId: job.organizationId,
      title: "Backup failed",
      message: error instanceof Error ? error.message.slice(0, 500) : "Backup failed",
      severity: "critical",
      resource: { type: "backup", id: job.backupId },
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }
}

export async function runRestore(job: BackupJob & { storageKey: string }): Promise<void> {
  const server = await serverForTenant(job.organizationId, job.serverId);
  try {
    await withAdapter(server, (adapter) => restoreSnapshot(job.storageKey, adapter));
    await pool.query(
      "UPDATE backups SET status = 'completed', last_restored_at = now(), error_message = NULL WHERE id = $1",
      [job.backupId],
    );
    await dispatchEvent({
      event: "backup.restored",
      organizationId: job.organizationId,
      title: "Backup restored",
      message: `A snapshot was restored to ${server.name}.`,
      severity: "success",
      resource: { type: "backup", id: job.backupId, name: server.name },
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
  } catch (error) {
    // The snapshot itself is still intact, so the row goes back to completed
    // rather than failed — otherwise a restore that could not connect would
    // permanently mark a good backup as unusable, and the claim in the restore
    // route would never let anyone try again.
    await pool.query(
      "UPDATE backups SET status = 'completed', error_message = $2 WHERE id = $1",
      [job.backupId, error instanceof Error ? error.message.slice(0, 1000) : "Restore failed"],
    );
    await dispatchEvent({
      event: "backup.restore_failed",
      organizationId: job.organizationId,
      title: "Restore failed",
      message: error instanceof Error ? error.message.slice(0, 500) : "Restore failed",
      severity: "critical",
      resource: { type: "backup", id: job.backupId },
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }
}
