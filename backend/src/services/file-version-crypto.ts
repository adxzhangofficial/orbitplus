import { decryptBytes, encryptBytes, sha256 } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";

export interface FileVersionMetadata {
  organizationId: string;
  serverId: string;
  path: string;
  checksum: string;
}

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
