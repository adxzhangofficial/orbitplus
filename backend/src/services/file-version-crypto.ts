import { decryptBytes, encryptBytes, hmac, hmacMatches, sha256 } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";

export interface FileVersionMetadata {
  organizationId: string;
  serverId: string;
  path: string;
  checksum: string;
}

/** Legacy per-version binding, retained so migration 005 can read old rows. */
function associatedData(metadata: FileVersionMetadata): string {
  return ["orbit-file-version-v1", metadata.organizationId, metadata.serverId, metadata.path, metadata.checksum].join("\0");
}

export function encryptFileVersionContent(content: Buffer, metadata: FileVersionMetadata): string {
  if (sha256(content) !== metadata.checksum) {
    throw new AppError(500, "FILE_VERSION_CHECKSUM_MISMATCH", "File version contents do not match their checksum");
  }
  return encryptBytes(content, associatedData(metadata));
}

export function decryptFileVersionContent(ciphertext: string, metadata: FileVersionMetadata): Buffer {
  const content = decryptBytes(ciphertext, associatedData(metadata));
  if (sha256(content) !== metadata.checksum) {
    throw new AppError(500, "FILE_VERSION_CHECKSUM_MISMATCH", "File version contents failed integrity verification");
  }
  return content;
}

export interface BlobMetadata {
  organizationId: string;
  checksum: string;
}

/**
 * Content-addressed payloads are shared by every version with identical bytes,
 * so the AAD binds only the tenant and the content digest. Cross-tenant reuse
 * remains impossible and altered bytes still fail authentication.
 */
function blobAssociatedData(metadata: BlobMetadata): string {
  return ["orbit-file-blob-v1", metadata.organizationId, metadata.checksum].join("\0");
}

export function encryptBlobContent(content: Buffer, metadata: BlobMetadata): string {
  if (sha256(content) !== metadata.checksum) {
    throw new AppError(500, "FILE_VERSION_CHECKSUM_MISMATCH", "File contents do not match their checksum");
  }
  return encryptBytes(content, blobAssociatedData(metadata));
}

export function decryptBlobContent(ciphertext: string, metadata: BlobMetadata): Buffer {
  const content = decryptBytes(ciphertext, blobAssociatedData(metadata));
  if (sha256(content) !== metadata.checksum) {
    throw new AppError(500, "FILE_VERSION_CHECKSUM_MISMATCH", "File contents failed integrity verification");
  }
  return content;
}

export interface VersionRowIdentity {
  organizationId: string;
  serverId: string;
  path: string;
  versionNumber: number;
  checksum: string;
}

function rowIdentity(identity: VersionRowIdentity): string {
  return [
    "orbit-file-version-row-v1",
    identity.organizationId,
    identity.serverId,
    identity.path,
    String(identity.versionNumber),
    identity.checksum,
  ].join("\0");
}

/** Replaces the path binding that the shared-blob AAD can no longer provide. */
export function signVersionRow(identity: VersionRowIdentity): string {
  return hmac(rowIdentity(identity));
}

export function assertVersionRowIntact(identity: VersionRowIdentity, signature: string | null | undefined): void {
  // Rows written before migration 005 carry no signature; the migration
  // backfills them, so a missing one after that point means tampering.
  if (!hmacMatches(rowIdentity(identity), signature)) {
    throw new AppError(500, "FILE_VERSION_SIGNATURE_INVALID", "This file version failed integrity verification");
  }
}
