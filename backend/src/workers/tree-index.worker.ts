import { serverForTenant } from "../services/server.service.js";
import { markIndexStatus, storeTree, walkRemoteTree } from "../services/tree-index.service.js";
import { logger } from "../lib/logger.js";

export interface TreeIndexJob {
  serverId: string;
  organizationId: string;
}

/**
 * Walks a server's tree and caches the metadata.
 *
 * A server whose `find` lacks `-printf` is marked unsupported rather than
 * failed, so the queue stops retrying something that cannot succeed and the UI
 * can fall back to live listings without presenting it as an error.
 */
export async function runTreeIndex(job: TreeIndexJob): Promise<void> {
  const server = await serverForTenant(job.organizationId, job.serverId);
  await markIndexStatus(server, "running");
  try {
    const result = await walkRemoteTree(server);
    await storeTree(server, result);
    logger.info("Remote tree indexed", {
      serverId: server.id,
      entries: result.entries.length,
      truncated: result.truncated,
      durationMs: result.durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tree index failed";
    const unsupported = message.includes("-printf") || message.includes("TREE_WALK_UNSUPPORTED");
    await markIndexStatus(server, unsupported ? "unsupported" : "failed", message);
    // Only genuine failures are rethrown; an unsupported server is a permanent
    // condition and retrying it would waste connections indefinitely.
    if (!unsupported) throw error;
  }
}
