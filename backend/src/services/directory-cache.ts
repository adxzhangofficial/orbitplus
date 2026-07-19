import type { RemoteEntry, RemoteFilesystem } from "../adapters/remote-filesystem.js";

/**
 * Shared, short-lived cache of remote directory listings.
 *
 * The cost of browsing is dominated by network round trips, not by the server
 * doing work: measured against a real host the round-trip time was over a
 * second, so a listing can never be faster than that no matter how it is
 * fetched. The only way browsing feels immediate is to already hold the answer
 * when the user clicks, which is what this cache and the prefetch below exist
 * to do.
 *
 * It is per process and deliberately small. At the scale this targets, a shared
 * Redis would add an operational dependency to save a round trip that is
 * already sub-millisecond.
 */

interface CacheEntry {
  entries: RemoteEntry[];
  fetchedAt: number;
}

const TTL_MS = 30_000;
/** Bounded so a user walking a large tree cannot grow this without limit. */
const MAX_ENTRIES = 5_000;

const cache = new Map<string, CacheEntry>();

function keyFor(organizationId: string, serverId: string, path: string): string {
  return `${organizationId}:${serverId}:${path}`;
}

export function readCached(organizationId: string, serverId: string, path: string): { entries: RemoteEntry[]; ageMs: number } | undefined {
  const entry = cache.get(keyFor(organizationId, serverId, path));
  if (!entry) return undefined;
  return { entries: entry.entries, ageMs: Date.now() - entry.fetchedAt };
}

export function isFresh(ageMs: number): boolean {
  return ageMs < TTL_MS;
}

export function writeCached(organizationId: string, serverId: string, path: string, entries: RemoteEntry[]): void {
  if (cache.size >= MAX_ENTRIES) {
    // Oldest insertion first; Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(keyFor(organizationId, serverId, path), { entries, fetchedAt: Date.now() });
}

/**
 * Drops a path and its ancestors after a write.
 *
 * The parent is invalidated too because creating or deleting a file changes the
 * parent's listing, and serving a stale parent would hide the user's own change
 * from them, which is the one kind of staleness nobody tolerates.
 */
export function invalidate(organizationId: string, serverId: string, path: string): void {
  const prefix = `${organizationId}:${serverId}:`;
  const normalized = path.replace(/\/+$/, "") || "/";
  const parent = normalized.split("/").slice(0, -1).join("/") || "/";
  cache.delete(keyFor(organizationId, serverId, normalized));
  cache.delete(keyFor(organizationId, serverId, parent));
  // A rename or recursive delete affects everything beneath the path.
  for (const key of cache.keys()) {
    if (key.startsWith(`${prefix}${normalized}/`)) cache.delete(key);
  }
}

export function invalidateServer(organizationId: string, serverId: string): void {
  const prefix = `${organizationId}:${serverId}:`;
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function cacheStats(): { size: number } {
  return { size: cache.size };
}

/**
 * Lists a directory and, in the same trip, the directories inside it.
 *
 * Children are fetched concurrently, so the whole set costs about two round
 * trips rather than one per directory. On a link with second-scale latency that
 * is the difference between every click waiting and every click being already
 * answered.
 *
 * Child failures are swallowed: a directory the user cannot read must not fail
 * the listing of its parent, it simply is not prefetched.
 */
export async function listWithPrefetch(
  adapter: RemoteFilesystem,
  organizationId: string,
  serverId: string,
  path: string,
  prefetchDepth: number,
): Promise<{ entries: RemoteEntry[]; prefetched: Record<string, RemoteEntry[]> }> {
  const entries = await adapter.list(path);
  writeCached(organizationId, serverId, path, entries);

  const prefetched: Record<string, RemoteEntry[]> = {};
  if (prefetchDepth <= 0) return { entries, prefetched };

  const directories = entries.filter((entry) => entry.type === "directory");
  // Capped so opening a directory with hundreds of subdirectories does not
  // launch hundreds of concurrent operations against the remote host.
  const targets = directories.slice(0, 24);

  await Promise.all(targets.map(async (directory) => {
    try {
      const children = await adapter.list(directory.path);
      writeCached(organizationId, serverId, directory.path, children);
      prefetched[directory.path] = children;
    } catch {
      // Unreadable or vanished between listing and prefetch; not an error for
      // the operation the user actually asked for.
    }
  }));

  return { entries, prefetched };
}
