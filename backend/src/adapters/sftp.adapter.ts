import { randomUUID } from "node:crypto";
import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import type { ConnectOptions } from "ssh2-sftp-client";
import type { ConnectionHealth, RemoteEntry, RemoteFilesystem, ServerConnectionRecord, ServerCredentials } from "./remote-filesystem.js";
import { joinRemoteRoot, normalizeRemotePath } from "./path-policy.js";
import { AppError, badRequest } from "../lib/errors.js";
import { resolveAllowedSftpAddress } from "./egress-policy.js";

export class SftpAdapter implements RemoteFilesystem {
  private readonly client = new SftpClient("orbit-sftp");

  constructor(
    private readonly server: ServerConnectionRecord,
    private readonly credentials: ServerCredentials,
  ) {}

  private mapped(remotePath: string): string {
    return joinRemoteRoot(this.server.root_path, remotePath);
  }

  /**
   * Set when a server had no pinned key and this connection captured one, so
   * the caller can persist it. Null on every later connection, which is
   * verified against the stored pin instead.
   */
  public capturedFingerprint: string | null = null;

  async connect(): Promise<void> {
    const suppliedFingerprint = this.server.host_fingerprint?.trim();
    // No pin yet means this is the first connection to this server. OpenSSH
    // accepts and records the key here rather than refusing, and demanding the
    // fingerprint up front only pushes the user to fetch it by hand and paste
    // it back, which is the same trust decision with more steps. The key is
    // captured and pinned, so every later connection is verified.
    const trustOnFirstUse = !suppliedFingerprint;
    let expected = "";
    if (!trustOnFirstUse) {
      expected = /^sha256:/i.test(suppliedFingerprint!)
        ? Buffer.from(suppliedFingerprint!.replace(/^sha256:/i, ""), "base64").toString("hex")
        : suppliedFingerprint!.toLowerCase().replace(/:/g, "");
      if (!/^[a-f0-9]{64}$/i.test(expected)) {
        throw badRequest("The pinned host fingerprint must be SHA256:base64 or a 64-character SHA-256 hex digest");
      }
    }
    if (this.server.authentication_type === "agent") {
      throw badRequest("SSH-agent authentication is disabled on shared workers; use a scoped password or private key");
    }
    const resolvedHost = await resolveAllowedSftpAddress(this.server.host);
    const options: ConnectOptions = {
      host: resolvedHost,
      port: this.server.port,
      username: this.server.username,
      // Kept short because a pooled connection is reused across requests, so
      // this cost is paid once rather than per click, and an unreachable host
      // must surface quickly instead of stalling the UI.
      readyTimeout: 8_000,
      retries: 0,
      hostHash: "sha256",
      hostVerifier: (fingerprint: string) => {
        const presented = fingerprint.toLowerCase().replace(/:/g, "");
        if (trustOnFirstUse) {
          this.capturedFingerprint = presented;
          return true;
        }
        return presented === expected;
      },
    };
    if (this.server.authentication_type === "password") options.password = this.credentials.password;
    if (this.server.authentication_type === "privateKey") {
      options.privateKey = this.credentials.privateKey;
      options.passphrase = this.credentials.passphrase;
    }
    try {
      await this.client.connect(options);
    } catch (error) {
      throw new AppError(502, "SFTP_CONNECTION_FAILED", error instanceof Error ? error.message : "SFTP connection failed");
    }
  }

  async disconnect(): Promise<void> {
    try { await this.client.end(); } catch { /* connection may never have opened */ }
  }

  async health(): Promise<ConnectionHealth> {
    const started = Date.now();
    await this.client.stat(this.mapped("/"));
    return { ok: true, latencyMs: Date.now() - started, message: "SFTP connection is online and fingerprint verified" };
  }

  async list(remotePath: string): Promise<RemoteEntry[]> {
    const normalized = normalizeRemotePath(remotePath);
    const entries = await this.client.list(this.mapped(normalized));
    return entries.map((entry) => ({
      name: entry.name,
      path: path.posix.join(normalized, entry.name),
      type: entry.type === "d" ? "directory" : entry.type === "-" ? "file" : entry.type === "l" ? "symlink" : "other",
      size: entry.size,
      modifiedAt: new Date(entry.modifyTime).toISOString(),
      permissions: entry.rights ? `${entry.rights.user}${entry.rights.group}${entry.rights.other}` : undefined,
    }));
  }

  async read(remotePath: string): Promise<Buffer> {
    const value = await this.client.get(this.mapped(remotePath));
    if (!Buffer.isBuffer(value)) throw new AppError(502, "SFTP_READ_FAILED", "Remote client returned an unsupported stream");
    return value;
  }

  async write(remotePath: string, content: Buffer): Promise<void> {
    const target = this.mapped(remotePath);
    const temporary = `${target}.orbit-${randomUUID()}.tmp`;
    try {
      await this.client.put(content, temporary);
      await this.client.posixRename(temporary, target);
    } catch (error) {
      try { await this.client.delete(temporary); } catch { /* best effort cleanup */ }
      throw error;
    }
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.mkdir(this.mapped(remotePath), true);
  }

  async delete(remotePath: string, recursive = false): Promise<void> {
    const normalized = normalizeRemotePath(remotePath);
    if (normalized === "/") throw badRequest("The server root cannot be deleted");
    const target = this.mapped(normalized);
    const details = await this.client.stat(target);
    if (details.isDirectory) await this.client.rmdir(target, recursive);
    else await this.client.delete(target);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.rename(this.mapped(from), this.mapped(to));
  }
}
