import type { IncomingMessage } from "node:http";
import ssh2 from "ssh2";
import type { Client as SshClient, ClientChannel } from "ssh2";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveAllowedSftpAddress } from "../adapters/egress-policy.js";
import { pool } from "../database/pool.js";
import { decryptJson } from "../lib/crypto.js";
import { hashToken } from "../lib/tokens.js";
import type { ServerConnectionRecord, ServerCredentials } from "../adapters/remote-filesystem.js";
import { logger } from "../lib/logger.js";

const { Client } = ssh2;

/**
 * Interactive SSH shells over a WebSocket.
 *
 * A real PTY rather than exec-per-command: interactive programs, editors, and
 * anything that redraws need a terminal, and a per-command model cannot support
 * them. Output is streamed as it arrives and recorded with timing so a session
 * can be replayed as evidence.
 */

const MAX_SESSION_MS = 4 * 60 * 60_000;
const IDLE_TIMEOUT_MS = 30 * 60_000;
/** Recording is flushed on this interval rather than per keystroke. */
const FLUSH_INTERVAL_MS = 2_000;

interface Pending {
  offsetMs: number;
  stream: "input" | "output";
  data: string;
}

/**
 * Commands refused outright.
 *
 * Deliberately narrow: this catches the catastrophic and unambiguous, not
 * anything merely risky. A filter that tries to be clever gives false
 * confidence, and someone with shell access has countless ways around any
 * pattern. The real controls are that sessions are attributable, recorded, and
 * that access requires a role.
 */
const REFUSED = [
  // Recursive and forced together, in either flag order and whether combined
  // into one flag or spelled separately. Either alone is ordinary work.
  { pattern: /(^|[;&|]\s*)(sudo\s+|doas\s+)?rm\s+(-\S+\s+)*(-\S*r\S*f|-\S*f\S*r)\S*(\s|$)/i, reason: "Recursive forced deletion" },
  { pattern: /(^|[;&|]\s*)(sudo\s+|doas\s+)?rm\s+(-\S+\s+)*(-r|--recursive)(\s+-\S+)*\s+(-f|--force)/i, reason: "Recursive forced deletion" },
  { pattern: /(^|[;&|]\s*)(sudo\s+|doas\s+)?rm\s+(-\S+\s+)*(-f|--force)(\s+-\S+)*\s+(-r|--recursive)/i, reason: "Recursive forced deletion" },
  { pattern: /(^|[;&|]\s*)(sudo\s+|doas\s+)?mkfs(\.\w+)?(\s|$)/i, reason: "Filesystem creation" },
  { pattern: /(^|[;&|]\s*)(sudo\s+|doas\s+)?dd\s[^\n]*\bof=\/dev\/(sd|nvme|vd|hd)/i, reason: "Raw write to a block device" },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, reason: "Fork bomb" },
  // Anchored to a command position so the word inside a commit message, a
  // filename, or a grep pattern is not mistaken for the command itself.
  { pattern: /(^|[;&|]\s*)(sudo\s+|doas\s+)?(shutdown|poweroff|halt|reboot)(\s|$)/i, reason: "Host power state change" },
  { pattern: /\bDROP\s+DATABASE\b/i, reason: "Database drop" },
  // nvme devices are named nvme0n1, so the character after the prefix may be a
  // digit rather than a letter.
  { pattern: /(>|>>)\s*\/dev\/(sd|nvme|vd|hd)[a-z0-9]/i, reason: "Redirect over a block device" },
];

export function screenCommand(line: string): { allowed: boolean; reason?: string } {
  const trimmed = line.trim();
  if (!trimmed) return { allowed: true };
  for (const rule of REFUSED) {
    if (rule.pattern.test(trimmed)) return { allowed: false, reason: rule.reason };
  }
  return { allowed: true };
}

interface TicketRow {
  organization_id: string;
  server_id: string;
  user_id: string;
}

/** Claims a ticket atomically so it cannot open two sessions. */
async function consumeTicket(token: string): Promise<TicketRow | null> {
  const result = await pool.query<TicketRow>(
    `UPDATE terminal_tickets SET consumed_at = now()
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING organization_id, server_id, user_id`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

function send(socket: WebSocket, type: string, payload: Record<string, unknown> = {}): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
}

function openShell(server: ServerConnectionRecord, credentials: ServerCredentials, size: { rows: number; cols: number }): Promise<{ client: SshClient; channel: ClientChannel }> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let host: string;
      try { host = await resolveAllowedSftpAddress(server.host); }
      catch (error) { reject(error); return; }

      const client = new Client();
      const timer = setTimeout(() => { client.destroy(); reject(new Error("The server did not respond in time")); }, 20_000);

      client.on("ready", () => {
        clearTimeout(timer);
        client.shell({ term: "xterm-256color", rows: size.rows, cols: size.cols }, (error, channel) => {
          if (error) { client.destroy(); reject(error); return; }
          resolve({ client, channel });
        });
      });
      client.on("error", (error: Error) => { clearTimeout(timer); client.destroy(); reject(error); });

      const pinned = server.host_fingerprint?.trim();
      client.connect({
        host, port: server.port, username: server.username, readyTimeout: 20_000,
        keepaliveInterval: 20_000,
        ...(server.authentication_type === "password" ? { password: credentials.password } : {}),
        ...(server.authentication_type === "privateKey"
          ? { privateKey: credentials.privateKey, passphrase: credentials.passphrase }
          : {}),
        hostHash: "sha256",
        hostVerifier: (fingerprint: string) => {
          if (!pinned) return true;
          const expected = /^sha256:/i.test(pinned)
            ? Buffer.from(pinned.replace(/^sha256:/i, ""), "base64").toString("hex")
            : pinned.toLowerCase().replace(/:/g, "");
          return fingerprint.toLowerCase().replace(/:/g, "") === expected;
        },
      });
    })();
  });
}

export function attachTerminalServer(httpServer: import("node:http").Server): WebSocketServer {
  // noServer so the upgrade is only accepted on this path; anything else is
  // rejected rather than being handed to a handler that does not expect it.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (pathname !== "/api/v1/terminal/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    void handleConnection(socket, request).catch((error: unknown) => {
      send(socket, "error", { message: error instanceof Error ? error.message : "Terminal failed" });
      socket.close();
    });
  });

  return wss;
}

async function handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const ticket = url.searchParams.get("ticket");
  if (!ticket) { send(socket, "error", { message: "A session ticket is required" }); socket.close(); return; }

  const claim = await consumeTicket(ticket);
  if (!claim) { send(socket, "error", { message: "This session ticket is invalid or has expired" }); socket.close(); return; }

  const serverResult = await pool.query<ServerConnectionRecord>(
    "SELECT * FROM server_connections WHERE id = $1 AND organization_id = $2",
    [claim.server_id, claim.organization_id],
  );
  const server = serverResult.rows[0];
  if (!server) { send(socket, "error", { message: "Server not found" }); socket.close(); return; }
  if (server.adapter_mode !== "sftp") {
    send(socket, "error", { message: "The demo adapter has no shell. Connect a real server to use the terminal." });
    socket.close();
    return;
  }

  const rows = Number(url.searchParams.get("rows")) || 24;
  const cols = Number(url.searchParams.get("cols")) || 80;

  const sessionResult = await pool.query<{ id: string }>(
    `INSERT INTO terminal_sessions(organization_id, server_id, user_id, rows, cols, client_ip)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [claim.organization_id, claim.server_id, claim.user_id, rows, cols, request.socket.remoteAddress ?? null],
  );
  const sessionId = sessionResult.rows[0]!.id;
  const startedAt = Date.now();

  send(socket, "status", { stage: "connecting", message: `Connecting to ${server.host}…` });

  let ssh: { client: SshClient; channel: ClientChannel };
  try {
    const credentials = server.credential_ciphertext
      ? decryptJson<ServerCredentials>(server.credential_ciphertext)
      : {};
    ssh = await openShell(server, credentials, { rows, cols });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open a shell";
    await pool.query(
      "UPDATE terminal_sessions SET status = 'failed', error_message = $2, ended_at = now() WHERE id = $1",
      [sessionId, message],
    );
    send(socket, "error", { message });
    socket.close();
    return;
  }

  const pending: Pending[] = [];
  let bytesOut = 0;
  let lastActivity = Date.now();
  let inputBuffer = "";

  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    await pool.query(
      `INSERT INTO terminal_recordings(session_id, offset_ms, stream, data)
       SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[])`,
      [sessionId, batch.map((e) => e.offsetMs), batch.map((e) => e.stream), batch.map((e) => e.data)],
    ).catch((error: unknown) => {
      // Recording must never take the session down with it.
      logger.error("Terminal recording write failed", { sessionId, error: error instanceof Error ? error.message : error });
    });
  };

  const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  const limitTimer = setTimeout(() => {
    send(socket, "status", { stage: "closing", message: "Maximum session length reached" });
    socket.close();
  }, MAX_SESSION_MS);
  const idleTimer = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      send(socket, "status", { stage: "closing", message: "Session closed after inactivity" });
      socket.close();
    }
  }, 60_000);

  send(socket, "ready", { sessionId, host: server.host, username: server.username });

  ssh.channel.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    bytesOut += chunk.length;
    pending.push({ offsetMs: Date.now() - startedAt, stream: "output", data: text });
    send(socket, "output", { data: text });
  });
  ssh.channel.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    pending.push({ offsetMs: Date.now() - startedAt, stream: "output", data: text });
    send(socket, "output", { data: text });
  });
  ssh.channel.on("close", () => {
    send(socket, "status", { stage: "closed", message: "Remote shell closed" });
    socket.close();
  });

  socket.on("message", (raw) => {
    lastActivity = Date.now();
    let message: { type?: string; data?: string; rows?: number; cols?: number };
    try { message = JSON.parse(raw.toString()) as typeof message; } catch { return; }

    if (message.type === "input" && typeof message.data === "string") {
      // Assembled so a whole line can be screened before it is submitted;
      // individual keystrokes carry no meaning on their own.
      inputBuffer += message.data;
      const newlineAt = inputBuffer.search(/[\r\n]/);
      if (newlineAt >= 0) {
        const line = inputBuffer.slice(0, newlineAt);
        inputBuffer = inputBuffer.slice(newlineAt + 1);
        const screened = screenCommand(line);
        if (!screened.allowed) {
          pending.push({ offsetMs: Date.now() - startedAt, stream: "input", data: `${line}\n` });
          send(socket, "blocked", { command: line, reason: screened.reason });
          // The newline is swallowed so the shell never receives the command,
          // and the line is cleared so the user is not left mid-edit.
          ssh.channel.write("");
          return;
        }
        pending.push({ offsetMs: Date.now() - startedAt, stream: "input", data: `${line}\n` });
      }
      ssh.channel.write(message.data);
      return;
    }

    if (message.type === "resize" && message.rows && message.cols) {
      ssh.channel.setWindow(message.rows, message.cols, 0, 0);
      void pool.query("UPDATE terminal_sessions SET rows = $2, cols = $3 WHERE id = $1", [sessionId, message.rows, message.cols]);
    }
  });

  const teardown = async () => {
    clearInterval(flushTimer);
    clearInterval(idleTimer);
    clearTimeout(limitTimer);
    await flush();
    try { ssh.channel.end(); } catch { /* already closed */ }
    try { ssh.client.end(); } catch { /* already closed */ }
    await pool.query(
      "UPDATE terminal_sessions SET status = 'closed', ended_at = now(), bytes_out = $2 WHERE id = $1 AND status = 'active'",
      [sessionId, bytesOut],
    ).catch(() => undefined);
  };

  socket.on("close", () => void teardown());
  socket.on("error", () => void teardown());
}
