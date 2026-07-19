import type { RemoteFilesystem, ServerConnectionRecord } from "./remote-filesystem.js";
import { AppError } from "../lib/errors.js";

/**
 * Keeps SFTP connections alive between requests.
 *
 * Every operation used to open a connection, do one thing, and tear it down, so
 * browsing a directory tree paid a full TCP and SSH handshake per click. On a
 * healthy remote host that is hundreds of milliseconds each time; the point of
 * the pool is that navigating feels like a local file manager rather than a
 * series of logins.
 *
 * It also holds a circuit breaker. An unreachable host previously made every
 * single request wait out the connect timeout, so one bad server made the whole
 * page hang repeatedly. After a connection failure the breaker is open for a
 * short window and further attempts fail immediately with the original reason.
 */

interface PooledEntry {
  adapter: RemoteFilesystem;
  inUse: boolean;
  lastUsedAt: number;
  createdAt: number;
}

interface BreakerState {
  openUntil: number;
  reason: string;
  failures: number;
}

const MAX_PER_SERVER = 3;
/**
 * How long a connection is held open with nobody using it.
 *
 * Long enough that a session of ordinary work never pays a handshake again:
 * reading a file, thinking, and clicking somewhere else stays inside one
 * connection. Keepalive traffic holds the session open across it, so the limit
 * is our own resource budget rather than any network timeout. Bounded because
 * an open SSH session is a standing capability on someone's production server,
 * and holding one for a user who wandered off hours ago is not defensible.
 */
const IDLE_TIMEOUT_MS = 15 * 60_000;
/** Long enough to outlive a slow handshake, short enough that a dead host is
 *  not re-probed on every keystroke. Grows with consecutive failures. */
const BREAKER_BASE_MS = 15_000;
const BREAKER_MAX_MS = 120_000;

const pools = new Map<string, PooledEntry[]>();
const breakers = new Map<string, BreakerState>();
const waiters = new Map<string, Array<(entry: PooledEntry) => void>>();

export function breakerFor(serverId: string): BreakerState | undefined {
  const state = breakers.get(serverId);
  if (!state) return undefined;
  if (state.openUntil <= Date.now()) {
    // Window elapsed. The failure count is kept so a host that keeps failing
    // backs off further rather than resetting to the base delay.
    breakers.set(serverId, { ...state, openUntil: 0 });
    return undefined;
  }
  return state;
}

export function recordFailure(serverId: string, reason: string): void {
  const previous = breakers.get(serverId);
  const failures = (previous?.failures ?? 0) + 1;
  const backoff = Math.min(BREAKER_BASE_MS * 2 ** (failures - 1), BREAKER_MAX_MS);
  breakers.set(serverId, { openUntil: Date.now() + backoff, reason, failures });
}

export function recordSuccess(serverId: string): void {
  breakers.delete(serverId);
}

function entriesFor(serverId: string): PooledEntry[] {
  let entries = pools.get(serverId);
  if (!entries) {
    entries = [];
    pools.set(serverId, entries);
  }
  return entries;
}

async function closeEntry(serverId: string, entry: PooledEntry): Promise<void> {
  const entries = entriesFor(serverId);
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
  // Drop the key once empty, otherwise the map accumulates one entry per server
  // ever connected to for the lifetime of the process.
  if (entries.length === 0) pools.delete(serverId);
  try { await entry.adapter.disconnect(); } catch { /* already gone */ }
}

/**
 * Hands back a live connection, creating one only when none is free.
 *
 * A caller that arrives while every connection is busy waits for one to be
 * released rather than opening an unbounded number, which is what would
 * otherwise happen when a page fires several listings at once.
 */
export async function acquire(
  server: ServerConnectionRecord,
  create: () => RemoteFilesystem,
): Promise<{ adapter: RemoteFilesystem; release: (failed?: boolean) => Promise<void> }> {
  const open = breakerFor(server.id);
  if (open) {
    const seconds = Math.ceil((open.openUntil - Date.now()) / 1000);
    throw new AppError(
      503,
      "SERVER_UNREACHABLE",
      `${server.name} could not be reached: ${open.reason} Retrying in ${seconds}s.`,
      { retryInSeconds: seconds, failures: open.failures },
    );
  }

  const entries = entriesFor(server.id);

  // A pooled connection can die between requests: the server restarts, the
  // network blips, sshd times it out. Handing one of those to a caller turns an
  // ordinary click into an error, so dead entries are dropped and the caller
  // transparently gets a fresh connection instead.
  for (const candidate of [...entries]) {
    const adapter = candidate.adapter as { alive?: boolean };
    if (!candidate.inUse && adapter.alive === false) {
      void closeEntry(server.id, candidate);
    }
  }

  let entry = entries.find((candidate) => !candidate.inUse);

  if (!entry && entries.length < MAX_PER_SERVER) {
    const adapter = create();
    const startedAt = Date.now();
    try {
      await adapter.connect();
      console.info("SFTP connection opened", { serverId: server.id, handshakeMs: Date.now() - startedAt, poolSize: entries.length + 1 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "connection failed";
      recordFailure(server.id, reason);
      throw error;
    }
    entry = { adapter, inUse: false, lastUsedAt: Date.now(), createdAt: Date.now() };
    entries.push(entry);
  }

  if (!entry) {
    entry = await new Promise<PooledEntry>((resolve, reject) => {
      const queue = waiters.get(server.id) ?? [];
      const timer = setTimeout(() => {
        const index = queue.indexOf(resolve);
        if (index >= 0) queue.splice(index, 1);
        reject(new AppError(503, "SERVER_BUSY", `${server.name} has too many operations in flight. Try again in a moment.`));
      }, 15_000);
      queue.push((free) => { clearTimeout(timer); resolve(free); });
      waiters.set(server.id, queue);
    });
  }

  entry.inUse = true;
  recordSuccess(server.id);
  const claimed = entry;

  return {
    adapter: claimed.adapter,
    release: async (failed = false) => {
      claimed.inUse = false;
      claimed.lastUsedAt = Date.now();
      // A connection that failed mid-operation may be in an unknown state, so
      // it is discarded rather than handed to the next caller.
      if (failed) {
        await closeEntry(server.id, claimed);
        return;
      }
      const queue = waiters.get(server.id);
      const next = queue?.shift();
      if (next) {
        claimed.inUse = true;
        next(claimed);
      }
    },
  };
}

/** Closes every connection for a server, used when its credentials change. */
export async function evictServer(serverId: string): Promise<void> {
  const entries = pools.get(serverId) ?? [];
  await Promise.all(entries.map((entry) => entry.adapter.disconnect().catch(() => undefined)));
  pools.delete(serverId);
  breakers.delete(serverId);
}

/** Closes connections idle past the timeout so sockets are not held open. */
export function sweepIdleConnections(): number {
  const cutoff = Date.now() - IDLE_TIMEOUT_MS;
  let closed = 0;
  for (const [serverId, entries] of pools) {
    for (const entry of [...entries]) {
      if (entry.inUse || entry.lastUsedAt > cutoff) continue;
      void closeEntry(serverId, entry);
      closed += 1;
    }
    if (entries.length === 0) pools.delete(serverId);
  }
  return closed;
}

const sweeper = setInterval(sweepIdleConnections, 30_000);
// Never keeps the process alive on its own.
sweeper.unref?.();

export async function closeAllConnections(): Promise<void> {
  clearInterval(sweeper);
  await Promise.all([...pools.keys()].map(evictServer));
}

export function poolStats(): Array<{ serverId: string; open: number; inUse: number }> {
  return [...pools].map(([serverId, entries]) => ({
    serverId,
    open: entries.length,
    inUse: entries.filter((entry) => entry.inUse).length,
  }));
}
