import { pool } from "../database/pool.js";
import type { RemoteFilesystem } from "../adapters/remote-filesystem.js";
import { env } from "../config/env.js";
import { conflict, notFound, AppError } from "../lib/errors.js";
import { sha256 } from "../lib/crypto.js";
import { decryptFileVersionContent, encryptFileVersionContent } from "./file-version-crypto.js";

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

export async function saveVersion(input: {
  organizationId: string;
  serverId: string;
  path: string;
  content: Buffer;
  userId: string;
  operation: string;
  note?: string;
}): Promise<{ id: string; versionNumber: number; checksum: string }> {
  const checksum = sha256(input.content);
  const contentCiphertext = encryptFileVersionContent(input.content, {
    organizationId: input.organizationId,
    serverId: input.serverId,
    path: input.path,
    checksum,
  });
  const result = await pool.query<{ id: string; version_number: number; checksum: string }>(
    `WITH locked AS (
       SELECT pg_advisory_xact_lock(hashtextextended($2::uuid::text || ':' || $3::text, 0))
     ), next_version AS (
       SELECT COALESCE(MAX(fv.version_number), 0) + 1 AS value
         FROM file_versions fv, locked
        WHERE fv.organization_id = $1::uuid AND fv.server_id = $2::uuid AND fv.path = $3
     )
     INSERT INTO file_versions
       (organization_id, server_id, path, version_number, content_ciphertext, size_bytes, checksum, operation, note, created_by)
     SELECT $1::uuid, $2::uuid, $3, next_version.value, $4, $5, $6, $7, $8, $9::uuid FROM next_version
     RETURNING id, version_number, checksum`,
    [input.organizationId, input.serverId, input.path, contentCiphertext, input.content.length, checksum, input.operation, input.note ?? "", input.userId],
  );
  const row = result.rows[0]!;
  return { id: row.id, versionNumber: row.version_number, checksum: row.checksum };
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
  const result = await pool.query<{ id: string; path: string; content_ciphertext: string; checksum: string }>(
    "SELECT id, path, content_ciphertext, checksum FROM file_versions WHERE id = $1 AND server_id = $2 AND organization_id = $3",
    [versionId, serverId, organizationId],
  );
  const version = result.rows[0];
  if (!version) throw notFound("File version");
  const content = decryptFileVersionContent(version.content_ciphertext, {
    organizationId,
    serverId,
    path: version.path,
    checksum: version.checksum,
  });
  return { id: version.id, path: version.path, checksum: version.checksum, content };
}

/**
 * Rebind encrypted version payloads when a file or directory is renamed.
 * The path is authenticated AES-GCM metadata, so changing only the SQL path
 * would intentionally make every historical version undecryptable.
 */
export async function moveVersionsForTenant(organizationId: string, serverId: string, from: string, to: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      path: string;
      checksum: string;
      content_ciphertext: string;
    }>(`SELECT id, path, checksum, content_ciphertext
          FROM file_versions
         WHERE organization_id = $1 AND server_id = $2
           AND (path = $3 OR left(path, length($3) + 1) = $3 || '/')
         ORDER BY path, version_number
         FOR UPDATE`, [organizationId, serverId, from]);

    for (const version of result.rows) {
      const nextPath = `${to}${version.path.slice(from.length)}`;
      const content = decryptFileVersionContent(version.content_ciphertext, {
        organizationId,
        serverId,
        path: version.path,
        checksum: version.checksum,
      });
      const ciphertext = encryptFileVersionContent(content, {
        organizationId,
        serverId,
        path: nextPath,
        checksum: version.checksum,
      });
      await client.query(
        "UPDATE file_versions SET path = $2, content_ciphertext = $3 WHERE id = $1",
        [version.id, nextPath, ciphertext],
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
