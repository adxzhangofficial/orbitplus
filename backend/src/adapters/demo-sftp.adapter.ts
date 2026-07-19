import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { ConnectionHealth, RemoteEntry, RemoteFilesystem, ServerConnectionRecord } from "./remote-filesystem.js";
import { normalizeRemotePath } from "./path-policy.js";
import { badRequest } from "../lib/errors.js";

const storageRoot = fileURLToPath(new URL("../../storage/demo", import.meta.url));

export class DemoSftpAdapter implements RemoteFilesystem {
  private readonly base: string;

  constructor(private readonly server: ServerConnectionRecord) {
    this.base = path.resolve(storageRoot, server.organization_id, server.id);
  }

  private localPath(remotePath: string): string {
    const normalized = normalizeRemotePath(remotePath);
    const resolved = path.resolve(this.base, `.${normalized}`);
    const relative = path.relative(this.base, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw badRequest("Path escapes the server root");
    return resolved;
  }

  async connect(): Promise<void> {
    await mkdir(this.base, { recursive: true });
  }

  async disconnect(): Promise<void> {}

  async health(): Promise<ConnectionHealth> {
    const started = Date.now();
    await this.connect();
    return { ok: true, latencyMs: Math.max(1, Date.now() - started), message: "Demo SFTP sandbox is online" };
  }

  async list(remotePath: string): Promise<RemoteEntry[]> {
    const normalized = normalizeRemotePath(remotePath);
    const entries = await readdir(this.localPath(normalized), { withFileTypes: true });
    return Promise.all(entries.map(async (entry) => {
      const childRemote = path.posix.join(normalized, entry.name);
      const details = await stat(this.localPath(childRemote));
      return {
        name: entry.name,
        path: childRemote,
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other",
        size: details.size,
        modifiedAt: details.mtime.toISOString(),
        permissions: (details.mode & 0o777).toString(8).padStart(3, "0"),
      } satisfies RemoteEntry;
    })).then((items) => items.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    }));
  }

  async read(remotePath: string): Promise<Buffer> {
    return readFile(this.localPath(remotePath));
  }

  async write(remotePath: string, content: Buffer): Promise<void> {
    const target = this.localPath(remotePath);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.orbit-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async mkdir(remotePath: string): Promise<void> {
    await mkdir(this.localPath(remotePath), { recursive: true });
  }

  async delete(remotePath: string, recursive = false): Promise<void> {
    const normalized = normalizeRemotePath(remotePath);
    if (normalized === "/") throw badRequest("The server root cannot be deleted");
    await rm(this.localPath(normalized), { recursive, force: false });
  }

  async rename(from: string, to: string): Promise<void> {
    const source = this.localPath(from);
    const destination = this.localPath(to);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(source, destination);
  }
}
