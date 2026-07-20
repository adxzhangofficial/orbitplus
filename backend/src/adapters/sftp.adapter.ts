import { randomUUID } from "node:crypto";
import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import type { ConnectOptions } from "ssh2-sftp-client";
import type { ConnectionHealth, RemoteEntry, RemoteFilesystem, ServerConnectionRecord, ServerCredentials } from "./remote-filesystem.js";
import { joinRemoteRoot, normalizeRemotePath } from "./path-policy.js";
import { AppError, badRequest } from "../lib/errors.js";
import { resolveAllowedSftpAddress } from "./egress-policy.js";
import { EMPTY_METRICS, metricsCommand, parseMetrics, type HostMetrics } from "./host-metrics.js";

/** The parts of the ssh2 Client and its exec stream this adapter touches. */
interface MetricsStream {
  on(event: string, listener: (...args: never[]) => void): void;
  stderr?: { on(event: string, listener: (...args: never[]) => void): void };
  destroy(): void;
}
interface SshClient {
  exec(command: string, callback: (error: Error | undefined, stream: MetricsStream) => void): void;
}

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

  /**
   * False once the transport has gone away.
   *
   * A pooled connection can die between requests without anyone noticing: the
   * server restarts, the network blips, or an idle timeout fires. Handing such
   * a connection to the next caller turns an ordinary click into an error, so
   * the pool checks this and reconnects instead.
   */
  public alive = false;

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
      // Without these a pooled connection is silently dropped by NAT, a
      // firewall, or sshd's own ClientAliveInterval, and the next request
      // discovers it only by failing. Traffic every 15 seconds keeps the
      // session established for as long as it is pooled.
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
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
      this.alive = true;
      // The transport announces its own death. Recording it here is what lets
      // the pool discard a connection instead of failing a user's request with
      // it. Errors are swallowed deliberately: an unhandled 'error' on the
      // underlying stream would otherwise take the process down.
      const markDead = () => { this.alive = false; };
      this.client.on("end", markDead);
      this.client.on("close", markDead);
      this.client.on("error", markDead);
    } catch (error) {
      this.alive = false;
      throw new AppError(502, "SFTP_CONNECTION_FAILED", error instanceof Error ? error.message : "SFTP connection failed");
    }
  }

  async disconnect(): Promise<void> {
    this.alive = false;
    try { await this.client.end(); } catch { /* connection may never have opened */ }
  }

  async health(): Promise<ConnectionHealth> {
    const started = Date.now();
    await this.client.stat(this.mapped("/"));
    return { ok: true, latencyMs: Date.now() - started, message: "SFTP connection is online and fingerprint verified" };
  }

  /**
   * Reads CPU, memory, and disk over the SSH transport this SFTP session is
   * already using.
   *
   * Returns nulls rather than throwing when the host will not answer: a server
   * that refuses exec, runs a restricted shell, or is not Linux is still a
   * perfectly healthy server, and a failure here must not turn a working
   * connection into an outage in the sweep that calls it.
   */
  async metrics(): Promise<HostMetrics> {
    const ssh = (this.client as unknown as { client?: SshClient }).client;
    if (!ssh || typeof ssh.exec !== "function") return { ...EMPTY_METRICS };

    const command = metricsCommand(this.server.root_path || "/");

    try {
      const output = await new Promise<string>((resolve, reject) => {
        // The command sleeps for a second by design; this bounds everything
        // else so a wedged host cannot hold the sweep open.
        const timer = setTimeout(() => reject(new Error("Metrics command timed out")), 15_000);
        ssh.exec(command, (error: Error | undefined, stream: MetricsStream) => {
          if (error) { clearTimeout(timer); reject(error); return; }
          let stdout = "";
          stream.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf8");
            // A misbehaving host must not be able to grow this without bound.
            if (stdout.length > 64_000) {
              clearTimeout(timer);
              stream.destroy();
              resolve(stdout);
            }
          });
          // stderr is drained but ignored: the command guards every read, so
          // anything here is noise from a shell profile, not a result.
          stream.stderr?.on("data", () => undefined);
          stream.on("close", () => { clearTimeout(timer); resolve(stdout); });
          stream.on("error", (streamError: Error) => { clearTimeout(timer); reject(streamError); });
        });
      });
      return parseMetrics(output);
    } catch {
      return { ...EMPTY_METRICS };
    }
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
