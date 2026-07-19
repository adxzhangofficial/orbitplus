import type { PoolClient } from "pg";
import { pool } from "../database/pool.js";
import type { RemoteFilesystem } from "../adapters/remote-filesystem.js";
import { env } from "../config/env.js";
import { conflict, notFound, AppError } from "../lib/errors.js";
import { sha256 } from "../lib/crypto.js";
import {
  assertVersionRowIntact,
  decryptBlobContent,
  encryptBlobContent,
  signVersionRow,
} from "./file-version-crypto.js";

function missing(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error && ["ENOENT", 2].includes((error as { code: string | number }).code)) return true;
  return error instanceof Error && /not found|no such file/i.test(error.message);
}

export async function readOptional(adapter: RemoteFilesystem, path: string): Promise<Buffer | null> {
  try { return await adapter.read(path); } catch (error) { if (missing(error)) return null; throw error; }
}

/** Reads a deletable entry only when it is a file; directories have no byte snapshot. */
export async function readOptionalDeleteSnapshot(adapter: RemoteFilesystem, path: string): Promise<Buffer | null> {
  try {
    return await readOptional(adapter, path);
  } catch (readError) {
    try {
      await adapter.list(path);
      return null;
    } catch {
      throw readError;
    }
  }
}

export function enforceFileLimit(content: Buffer): void {
  if (content.length > env.MAX_FILE_BYTES) {
    throw new AppError(413, "FILE_TOO_LARGE", `Files edited through the API are limited to ${env.MAX_FILE_BYTES} bytes`);
  }
}

/**
 * Stores content once per (organization, checksum). Repeated saves of identical
 * bytes, rollbacks, and revert cycles all collapse onto one payload, so version
 * history costs the size of the distinct contents rather than the number of
 * versions.
 */
async function upsertBlob(
  client: PoolClient | typeof pool,
  organizationId: string,
  content: Buffer,
  checksum: string,
): Promise<void> {
  await client.query(
    `INSERT INTO file_blobs(organization_id, checksum, content_ciphertext, size_bytes)
     VALUES($1, $2, $3, $4)
     ON CONFLICT (organization_id, checksum) DO NOTHING`,
    [organizationId, checksum, encryptBlobContent(content, { organizationId, checksum }), content.length],
  );
}

export async function saveVersion(input: {
  organizationId: string;
  serverId: string;
  path: string;
  content: Buffer;
  userId: string;
  operation: string;
  note?: string;
}): Promise<{ id: string; versionNumber: number; checksum: string; deduplicated: boolean }> {
  const checksum = sha256(input.content);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT 1 FROM file_blobs WHERE organization_id = $1 AND checksum = $2",
      [input.organizationId, checksum],
    );
    const deduplicated = (existing.rowCount ?? 0) > 0;
    if (!deduplicated) await upsertBlob(client, input.organizationId, input.content, checksum);

    // Held for the rest of the transaction, so the number chosen below cannot
    // be taken by a concurrent write to the same path.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))", [
      input.serverId,
      input.path,
    ]);
    const numbering = await client.query<{ value: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS value
         FROM file_versions
        WHERE organization_id = $1 AND server_id = $2 AND path = $3`,
      [input.organizationId, input.serverId, input.path],
    );
    const versionNumber = numbering.rows[0]!.value;

    // The shared blob AAD no longer covers the path, so the row carries its own
    // signature. It is part of the INSERT because the blob-backed CHECK
    // constraint is evaluated per statement and rejects an unsigned row.
    const signature = signVersionRow({
      organizationId: input.organizationId,
      serverId: input.serverId,
      path: input.path,
      versionNumber,
      checksum,
    });

    const result = await client.query<{ id: string; version_number: number; checksum: string }>(
      `INSERT INTO file_versions
         (organization_id, server_id, path, version_number, size_bytes, checksum, operation, note, created_by, row_signature)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, version_number, checksum`,
      [
        input.organizationId, input.serverId, input.path, versionNumber, input.content.length,
        checksum, input.operation, input.note ?? "", input.userId, signature,
      ],
    );
    const row = result.rows[0]!;
    await client.query("COMMIT");
    return { id: row.id, versionNumber: row.version_number, checksum: row.checksum, deduplicated };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function writeVersioned(input: {
  adapter: RemoteFilesystem;
  organizationId: string;
  serverId: string;
  path: string;
  content: Buffer;
  userId: string;
  expectedChecksum?: string;
  note?: string;
}) {
  enforceFileLimit(input.content);
  const current = await readOptional(input.adapter, input.path);
  if (input.expectedChecksum && (!current || sha256(current) !== input.expectedChecksum)) {
    throw conflict("The remote file changed after it was opened; refresh before saving");
  }
  let previousVersionId: string | undefined;
  if (current) {
    enforceFileLimit(current);
    previousVersionId = (await saveVersion({ ...input, content: current, operation: "pre-write" })).id;
  }
  await input.adapter.write(input.path, input.content);
  const version = await saveVersion({ ...input, operation: "write" });
  return { ...version, previousVersionId };
}

export async function versionForTenant(organizationId: string, serverId: string, versionId: string) {
  const result = await pool.query<{
    id: string;
    path: string;
    version_number: number;
    checksum: string;
    row_signature: string | null;
    content_ciphertext: string;
  }>(
    `SELECT fv.id, fv.path, fv.version_number, fv.checksum, fv.row_signature, b.content_ciphertext
       FROM file_versions fv
       JOIN file_blobs b ON b.organization_id = fv.organization_id AND b.checksum = fv.checksum
      WHERE fv.id = $1 AND fv.server_id = $2 AND fv.organization_id = $3`,
    [versionId, serverId, organizationId],
  );
  const version = result.rows[0];
  if (!version) throw notFound("File version");
  assertVersionRowIntact(
    {
      organizationId,
      serverId,
      path: version.path,
      versionNumber: version.version_number,
      checksum: version.checksum,
    },
    version.row_signature,
  );
  const content = decryptBlobContent(version.content_ciphertext, { organizationId, checksum: version.checksum });
  return { id: version.id, path: version.path, checksum: version.checksum, content };
}

/**
 * Rebinds version rows when a file or directory is renamed.
 *
 * Payloads are content-addressed and shared, so nothing is decrypted here: only
 * the path and its signature change. This previously re-encrypted every
 * historical version of every affected file, making a directory rename cost
 * O(versions) of AES work.
 */
export async function moveVersionsForTenant(organizationId: string, serverId: string, from: string, to: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      path: string;
      version_number: number;
      checksum: string;
    }>(`SELECT id, path, version_number, checksum
          FROM file_versions
         WHERE organization_id = $1 AND server_id = $2
           AND (path = $3 OR left(path, length($3) + 1) = $3 || '/')
         ORDER BY path, version_number
         FOR UPDATE`, [organizationId, serverId, from]);

    for (const version of result.rows) {
      const nextPath = `${to}${version.path.slice(from.length)}`;
      await client.query(
        "UPDATE file_versions SET path = $2, row_signature = $3 WHERE id = $1",
        [
          version.id,
          nextPath,
          signVersionRow({
            organizationId,
            serverId,
            path: nextPath,
            versionNumber: version.version_number,
            checksum: version.checksum,
          }),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Per-plan version history windows. Enterprise retains until told otherwise. */
export const RETENTION_DAYS: Record<string, number | null> = {
  free: 7,
  pro: 90,
  enterprise: null,
};

/**
 * Deletes versions outside an organization's retention window, then removes any
 * blob no version references. Ordering matters: dropping blobs first would
 * orphan rows that are still live.
 */
export async function pruneExpiredVersions(organizationId: string, plan: string): Promise<{ versions: number; blobs: number }> {
  const days = RETENTION_DAYS[plan] ?? null;
  if (days === null) return { versions: 0, blobs: 0 };

  const versions = await pool.query(
    `DELETE FROM file_versions
      WHERE organization_id = $1
        AND created_at < now() - make_interval(days => $2)
        -- The newest version of every path is always kept, otherwise an idle
        -- file would lose its history entirely rather than being trimmed.
        AND id NOT IN (
          SELECT DISTINCT ON (server_id, path) id
            FROM file_versions
           WHERE organization_id = $1
           ORDER BY server_id, path, version_number DESC
        )`,
    [organizationId, days],
  );

  const blobs = await pool.query(
    `DELETE FROM file_blobs b
      WHERE b.organization_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM file_versions v
           WHERE v.organization_id = b.organization_id AND v.checksum = b.checksum
        )`,
    [organizationId],
  );

  return { versions: versions.rowCount ?? 0, blobs: blobs.rowCount ?? 0 };
}

/** Distinct stored bytes for an organization, which is what storage is billed on. */
export async function storageUsage(organizationId: string): Promise<{ blobBytes: number; versionCount: number; blobCount: number }> {
  const result = await pool.query<{ blob_bytes: string; version_count: string; blob_count: string }>(
    `SELECT
       COALESCE((SELECT sum(size_bytes) FROM file_blobs WHERE organization_id = $1), 0) AS blob_bytes,
       (SELECT count(*) FROM file_versions WHERE organization_id = $1) AS version_count,
       (SELECT count(*) FROM file_blobs WHERE organization_id = $1) AS blob_count`,
    [organizationId],
  );
  const row = result.rows[0]!;
  return {
    blobBytes: Number(row.blob_bytes),
    versionCount: Number(row.version_count),
    blobCount: Number(row.blob_count),
  };
}
