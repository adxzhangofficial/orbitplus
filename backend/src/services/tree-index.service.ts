import ssh2 from "ssh2";
import type { Client as SshClient } from "ssh2";
import { resolveAllowedSftpAddress } from "../adapters/egress-policy.js";
import { joinRemoteRoot, normalizeRemotePath } from "../adapters/path-policy.js";
import { pool } from "../database/pool.js";
import { decryptJson } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import type { ServerConnectionRecord, ServerCredentials } from "../adapters/remote-filesystem.js";

const { Client } = ssh2;

/**
 * Walks a remote filesystem in a single round trip and caches the metadata.
 *
 * SFTP readdir costs one round trip per directory, so a tree of five hundred
 * directories over a link with one second of latency takes over eight minutes.
 * One `find` returns the whole tree at once, which turns that into a couple of
 * seconds regardless of how many directories there are.
 *
 * Only names, sizes, modes, and timestamps are cached. Contents are always read
 * live, because showing a stale file in an editor invites someone to overwrite
 * a change made outside Orbit without ever seeing it.
 */

/** Directories that are large, regenerable, and never worth walking. */
export const DEFAULT_EXCLUDES = [
  "node_modules", ".git", ".svn", ".hg", "venv", ".venv", "__pycache__",
  "vendor", "dist", "build", ".next", ".nuxt", "target", ".cache",
  ".terraform", "bower_components", ".gradle", ".m2", "site-packages",
];

const MAX_ENTRIES = 200_000;
const WALK_TIMEOUT_MS = 60_000;

export interface WalkedEntry {
  path: string;
  parentPath: string;
  name: string;
  type: "file" | "directory" | "symlink";
  sizeBytes: number;
  mode: string | null;
  modifiedAt: Date | null;
}

export interface WalkResult {
  entries: WalkedEntry[];
  truncated: boolean;
  durationMs: number;
}

function connect(server: ServerConnectionRecord, credentials: ServerCredentials): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let host: string;
      try {
        host = await resolveAllowedSftpAddress(server.host);
      } catch (error) { reject(error); return; }

      const client = new Client();
      const timer = setTimeout(() => {
        client.destroy();
        reject(new AppError(504, "SSH_TIMEOUT", `${server.host} did not respond in time`));
      }, 15_000);

      client.on("ready", () => { clearTimeout(timer); resolve(client); });
      client.on("error", (error: Error) => {
        clearTimeout(timer);
        client.destroy();
        reject(new AppError(502, "SSH_CONNECT_FAILED", error.message));
      });

      const expected = server.host_fingerprint?.trim();
      client.connect({
        host, port: server.port, username: server.username, readyTimeout: 15_000,
        ...(server.authentication_type === "password" ? { password: credentials.password } : {}),
        ...(server.authentication_type === "privateKey"
          ? { privateKey: credentials.privateKey, passphrase: credentials.passphrase }
          : {}),
        hostHash: "sha256",
        hostVerifier: (fingerprint: string) => {
          if (!expected) return true;
          const normalized = /^sha256:/i.test(expected)
            ? Buffer.from(expected.replace(/^sha256:/i, ""), "base64").toString("hex")
            : expected.toLowerCase().replace(/:/g, "");
          return fingerprint.toLowerCase().replace(/:/g, "") === normalized;
        },
      });
    })();
  });
}

function buildFindCommand(root: string, excludes: string[], maxDepth: number): string {
  const pruned = excludes.map((name) => `-name ${JSON.stringify(name)}`).join(" -o ");
  // %y type, %s size, %T@ epoch mtime, %m octal mode, %p path. Tab separated
  // because every one of those fields is tab-free while paths may contain
  // spaces, quotes, and newlines are handled by the caller.
  return [
    `find ${JSON.stringify(root)}`,
    `-maxdepth ${maxDepth}`,
    `\\( ${pruned} \\) -prune -o`,
    `-printf '%y\\t%s\\t%T@\\t%m\\t%p\\n'`,
    `2>/dev/null`,
  ].join(" ");
}

function parseFindOutput(output: string, root: string): { entries: WalkedEntry[]; truncated: boolean } {
  const entries: WalkedEntry[] = [];
  let truncated = false;

  for (const line of output.split("\n")) {
    if (!line) continue;
    if (entries.length >= MAX_ENTRIES) { truncated = true; break; }
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const [rawType, rawSize, rawMtime, rawMode] = parts;
    // Paths may legitimately contain tabs, so everything after the fourth
    // separator is the path rather than just the fifth field.
    const absolute = parts.slice(4).join("\t");
    if (!absolute.startsWith(root)) continue;

    // Re-expressed relative to the configured root, which is what the rest of
    // the application and the path policy operate on.
    const relative = normalizeRemotePath(absolute.slice(root.length) || "/");
    if (relative === "/") continue;

    const type = rawType === "d" ? "directory" : rawType === "l" ? "symlink" : "file";
    const epoch = Number(rawMtime);
    const segments = relative.split("/").filter(Boolean);
    entries.push({
      path: relative,
      parentPath: segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "/",
      name: segments.at(-1) ?? relative,
      type,
      sizeBytes: Number(rawSize) || 0,
      mode: rawMode || null,
      modifiedAt: Number.isFinite(epoch) ? new Date(epoch * 1000) : null,
    });
  }
  return { entries, truncated };
}

export async function walkRemoteTree(
  server: ServerConnectionRecord,
  options: { maxDepth?: number; excludes?: string[] } = {},
): Promise<WalkResult> {
  const credentials = server.credential_ciphertext
    ? decryptJson<ServerCredentials>(server.credential_ciphertext)
    : {};
  const root = joinRemoteRoot(server.root_path, "/");
  const command = buildFindCommand(root, options.excludes ?? DEFAULT_EXCLUDES, options.maxDepth ?? 12);

  const started = Date.now();
  const client = await connect(server, credentials);

  try {
    const output = await new Promise<string>((resolve, reject) => {
      client.exec(command, (error, stream) => {
        if (error) { reject(new AppError(502, "SSH_EXEC_FAILED", error.message)); return; }
        let stdout = "";
        let bytes = 0;
        const timer = setTimeout(() => {
          stream.close();
          // Whatever arrived is still useful; the caller marks it truncated.
          resolve(stdout);
        }, WALK_TIMEOUT_MS);

        stream.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          // Bounded so a pathological tree cannot exhaust worker memory.
          if (bytes > 64 * 1024 * 1024) { clearTimeout(timer); stream.close(); resolve(stdout); return; }
          stdout += chunk.toString("utf8");
        });
        stream.stderr.on("data", () => undefined);
        stream.on("close", (code: number) => {
          clearTimeout(timer);
          // find exits non-zero for unreadable directories, which is expected
          // and not a failure as long as output was produced.
          if (code !== 0 && stdout.length === 0) {
            reject(new AppError(502, "TREE_WALK_UNSUPPORTED", "This server's find command does not support -printf, so the tree could not be indexed"));
            return;
          }
          resolve(stdout);
        });
      });
    });

    const { entries, truncated } = parseFindOutput(output, root);
    return { entries, truncated, durationMs: Date.now() - started };
  } finally {
    client.end();
  }
}

/** Replaces the cached tree for one server inside a single transaction. */
export async function storeTree(server: ServerConnectionRecord, result: WalkResult): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM remote_entries WHERE server_id = $1", [server.id]);

    // Inserted in batches: one statement per entry would be tens of thousands
    // of round trips to Postgres for a large tree.
    const BATCH = 500;
    for (let index = 0; index < result.entries.length; index += BATCH) {
      const batch = result.entries.slice(index, index + BATCH);
      const values: unknown[] = [];
      const tuples = batch.map((entry, offset) => {
        const base = offset * 8;
        values.push(
          server.organization_id, server.id, entry.path, entry.parentPath,
          entry.name, entry.type, entry.sizeBytes, entry.mode,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
      });
      await client.query(
        `INSERT INTO remote_entries(organization_id, server_id, path, parent_path, name, type, size_bytes, mode)
         VALUES ${tuples.join(",")}
         ON CONFLICT (server_id, path) DO NOTHING`,
        values,
      );
    }

    // Timestamps are applied separately so the bulk insert stays a simple
    // uniform shape; a null mtime is common on some filesystems.
    for (let index = 0; index < result.entries.length; index += BATCH) {
      const batch = result.entries.slice(index, index + BATCH).filter((entry) => entry.modifiedAt);
      if (!batch.length) continue;
      await client.query(
        `UPDATE remote_entries AS r SET modified_at = v.modified_at::timestamptz
           FROM (SELECT unnest($2::text[]) AS path, unnest($3::text[]) AS modified_at) AS v
          WHERE r.server_id = $1 AND r.path = v.path`,
        [server.id, batch.map((entry) => entry.path), batch.map((entry) => entry.modifiedAt!.toISOString())],
      );
    }

    await client.query(
      `INSERT INTO remote_index_runs(server_id, organization_id, status, entry_count, truncated, duration_ms, completed_at, updated_at)
       VALUES($1, $2, 'ready', $3, $4, $5, now(), now())
       ON CONFLICT (server_id) DO UPDATE SET
         status = 'ready', entry_count = EXCLUDED.entry_count, truncated = EXCLUDED.truncated,
         duration_ms = EXCLUDED.duration_ms, error_message = NULL, completed_at = now(), updated_at = now()`,
      [server.id, server.organization_id, result.entries.length, result.truncated, result.durationMs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markIndexStatus(
  server: ServerConnectionRecord,
  status: "pending" | "running" | "failed" | "unsupported",
  errorMessage?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO remote_index_runs(server_id, organization_id, status, error_message, started_at, updated_at)
     VALUES($1, $2, $3, $4, CASE WHEN $3 = 'running' THEN now() END, now())
     ON CONFLICT (server_id) DO UPDATE SET
       status = EXCLUDED.status, error_message = EXCLUDED.error_message,
       started_at = COALESCE(EXCLUDED.started_at, remote_index_runs.started_at), updated_at = now()`,
    [server.id, server.organization_id, status, errorMessage ?? null],
  );
}

export interface CachedListing {
  entries: Array<{ name: string; path: string; type: string; size: number; permissions: string | null; modifiedAt: string | null }>;
  indexedAt: string | null;
  status: string;
}

/** Reads one directory out of the cached tree. */
export async function listFromIndex(serverId: string, path: string): Promise<CachedListing | null> {
  const state = await pool.query<{ status: string; updated_at: Date }>(
    "SELECT status, updated_at FROM remote_index_runs WHERE server_id = $1",
    [serverId],
  );
  if (state.rows[0]?.status !== "ready") return null;

  const rows = await pool.query<{
    name: string; path: string; type: string; size_bytes: string; mode: string | null; modified_at: Date | null;
  }>(
    `SELECT name, path, type, size_bytes, mode, modified_at
       FROM remote_entries
      WHERE server_id = $1 AND parent_path = $2
      ORDER BY type = 'directory' DESC, lower(name)`,
    [serverId, path],
  );

  return {
    entries: rows.rows.map((row) => ({
      name: row.name,
      path: row.path,
      type: row.type,
      size: Number(row.size_bytes),
      permissions: row.mode,
      modifiedAt: row.modified_at?.toISOString() ?? null,
    })),
    indexedAt: state.rows[0]?.updated_at.toISOString() ?? null,
    status: state.rows[0]!.status,
  };
}

/** Applies a local mutation to the cache so the UI does not need a full rewalk. */
export async function invalidatePath(serverId: string, path: string): Promise<void> {
  await pool.query(
    "DELETE FROM remote_entries WHERE server_id = $1 AND (path = $2 OR left(path, length($2) + 1) = $2 || '/')",
    [serverId, path],
  );
}
