import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RemoteFilesystem } from "../adapters/remote-filesystem.js";
import { decryptJson, encryptJson } from "../lib/crypto.js";
import { AppError, notFound } from "../lib/errors.js";

const backupRoot = fileURLToPath(new URL("../../storage/backups", import.meta.url));

interface SnapshotFile { path: string; content: string; }
interface Snapshot { version: 1; rootPath: string; createdAt: string; files: SnapshotFile[]; }

async function collect(adapter: RemoteFilesystem, current: string, files: SnapshotFile[], state: { bytes: number }): Promise<void> {
  const entries = await adapter.list(current);
  for (const entry of entries) {
    if (files.length >= 5_000) throw new AppError(413, "BACKUP_LIMIT_EXCEEDED", "A single API snapshot is limited to 5,000 files");
    if (entry.type === "directory") await collect(adapter, entry.path, files, state);
    if (entry.type === "file") {
      const content = await adapter.read(entry.path);
      state.bytes += content.length;
      if (state.bytes > 100 * 1024 * 1024) throw new AppError(413, "BACKUP_LIMIT_EXCEEDED", "A single API snapshot is limited to 100 MB");
      files.push({ path: entry.path, content: content.toString("base64") });
    }
  }
}

export async function createSnapshot(organizationId: string, backupId: string, rootPath: string, adapter: RemoteFilesystem) {
  const files: SnapshotFile[] = [];
  const state = { bytes: 0 };
  await collect(adapter, rootPath, files, state);
  const snapshot: Snapshot = { version: 1, rootPath, createdAt: new Date().toISOString(), files };
  const directory = path.join(backupRoot, organizationId);
  await mkdir(directory, { recursive: true });
  const storageKey = path.join(organizationId, `${backupId}.orbitbk`);
  await writeFile(path.join(backupRoot, storageKey), encryptJson(snapshot), { flag: "wx", mode: 0o600 });
  return { storageKey, sizeBytes: state.bytes, fileCount: files.length };
}

export async function restoreSnapshot(storageKey: string, adapter: RemoteFilesystem) {
  const resolved = path.resolve(backupRoot, storageKey);
  const relative = path.relative(backupRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw notFound("Backup snapshot");
  let snapshot: Snapshot;
  try { snapshot = decryptJson<Snapshot>(await readFile(resolved, "utf8")); }
  catch { throw notFound("Backup snapshot"); }
  if (snapshot.version !== 1 || !Array.isArray(snapshot.files) || typeof snapshot.rootPath !== "string") {
    throw notFound("Backup snapshot");
  }
  for (const file of snapshot.files) await adapter.write(file.path, Buffer.from(file.content, "base64"));
  return { restoredFiles: snapshot.files.length, rootPath: snapshot.rootPath };
}
