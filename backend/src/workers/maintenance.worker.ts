import { pool } from "../database/pool.js";
import { pruneAuthTokens } from "../services/auth-token.service.js";
import { deleteSnapshot } from "../services/backup.service.js";
import { pruneExpiredVersions } from "../services/file.service.js";

/**
 * Applies each organization's retention window.
 *
 * Enterprise organizations are skipped inside pruneExpiredVersions rather than
 * filtered here, so the plan-to-window mapping lives in exactly one place.
 */
export async function runRetentionSweep(): Promise<{ organizations: number; versions: number; blobs: number }> {
  const organizations = await pool.query<{ id: string; plan: string }>(
    "SELECT id, plan FROM organizations WHERE status IN ('active', 'trialing')",
  );
  let versions = 0;
  let blobs = 0;
  for (const organization of organizations.rows) {
    try {
      const result = await pruneExpiredVersions(organization.id, organization.plan);
      versions += result.versions;
      blobs += result.blobs;
    } catch (error) {
      // One tenant's failure must not abort the sweep for everyone else.
      console.error("Retention sweep failed for organization", {
        organizationId: organization.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  return { organizations: organizations.rowCount ?? 0, versions, blobs };
}

/**
 * Deletes snapshots whose retention window has passed.
 *
 * Every backup is created with a retention_until, and nothing was enforcing it,
 * so stored snapshots grew without bound. The bytes go first: a row without its
 * file is a broken restore, but a file without its row is invisible and would
 * be orphaned on disk forever.
 *
 * A backup currently being restored is left alone, however old it is. Deleting
 * the source of a running restore is the one way this sweep could destroy data
 * someone is actively relying on.
 */
export async function runBackupExpiry(): Promise<{ expired: number; bytesFreed: number }> {
  const due = await pool.query<{ id: string; storage_key: string | null; size_bytes: string }>(
    `SELECT id, storage_key, size_bytes FROM backups
      WHERE retention_until IS NOT NULL
        AND retention_until < now()
        AND status <> 'restoring'
      LIMIT 500`,
  );

  let expired = 0;
  let bytesFreed = 0;
  for (const backup of due.rows) {
    try {
      if (backup.storage_key) await deleteSnapshot(backup.storage_key);
      await pool.query("DELETE FROM backups WHERE id = $1", [backup.id]);
      expired += 1;
      bytesFreed += Number(backup.size_bytes) || 0;
    } catch (error) {
      // One unreadable snapshot must not stop the rest from being reclaimed.
      console.error("Backup expiry failed", {
        backupId: backup.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  return { expired, bytesFreed };
}

export async function runTokenPrune(): Promise<number> {
  return pruneAuthTokens();
}

/** Expires sessions whose refresh window has passed so the table stays bounded. */
export async function runSessionPrune(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM sessions
      WHERE expires_at < now() - interval '30 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')`,
  );
  return result.rowCount ?? 0;
}
