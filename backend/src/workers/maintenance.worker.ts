import { pool } from "../database/pool.js";
import { pruneAuthTokens } from "../services/auth-token.service.js";
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
