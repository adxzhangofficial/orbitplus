import { pool } from "../database/pool.js";
import { decryptJson } from "../lib/crypto.js";
import { acquire } from "./connection-pool.js";
import { DemoSftpAdapter } from "./demo-sftp.adapter.js";
import type { RemoteFilesystem, ServerConnectionRecord, ServerCredentials } from "./remote-filesystem.js";
import { SftpAdapter } from "./sftp.adapter.js";

export { evictServer, poolStats, closeAllConnections } from "./connection-pool.js";

export function adapterFor(server: ServerConnectionRecord): RemoteFilesystem {
  if (server.adapter_mode === "demo") return new DemoSftpAdapter(server);
  const credentials = server.credential_ciphertext
    ? decryptJson<ServerCredentials>(server.credential_ciphertext)
    : {};
  return new SftpAdapter(server, credentials);
}

async function recordCapturedFingerprint(server: ServerConnectionRecord, adapter: RemoteFilesystem): Promise<void> {
  if (!(adapter instanceof SftpAdapter) || !adapter.capturedFingerprint) return;
  await pool.query(
    // Guarded on the column still being empty so a concurrent first connection
    // cannot overwrite a pin that has already been established.
    "UPDATE server_connections SET host_fingerprint = $2, updated_at = now() WHERE id = $1 AND host_fingerprint IS NULL",
    [server.id, adapter.capturedFingerprint],
  ).catch((error: unknown) => {
    // Recording the pin must not fail the operation the user asked for.
    console.error("Could not record host fingerprint", {
      serverId: server.id,
      error: error instanceof Error ? error.message : error,
    });
  });
  adapter.capturedFingerprint = null;
}

/**
 * Runs one operation against a server without touching the pool or the circuit
 * breaker.
 *
 * Used for anything the user explicitly asked for right now: testing an
 * unsaved connection, or pressing "probe". Those must actually attempt the
 * connection. Backing off is correct for background work, but telling someone
 * who just clicked "Test connection" that we declined to try is not a useful
 * answer, and a preflight for a server that does not exist yet has nothing
 * worth pooling.
 */
export async function withDirectAdapter<T>(
  server: ServerConnectionRecord,
  operation: (adapter: RemoteFilesystem) => Promise<T>,
): Promise<T> {
  const adapter = adapterFor(server);
  await adapter.connect();
  try {
    return await operation(adapter);
  } finally {
    await adapter.disconnect().catch(() => undefined);
  }
}

export async function withAdapter<T>(
  server: ServerConnectionRecord,
  operation: (adapter: RemoteFilesystem) => Promise<T>,
): Promise<T> {
  // The demo adapter is local filesystem access with no handshake, so pooling
  // it would add bookkeeping for no gain.
  if (server.adapter_mode === "demo") {
    const adapter = adapterFor(server);
    await adapter.connect();
    try {
      return await operation(adapter);
    } finally {
      await adapter.disconnect();
    }
  }

  const { adapter, release } = await acquire(server, () => adapterFor(server));
  let failed = false;
  try {
    await recordCapturedFingerprint(server, adapter);
    return await operation(adapter);
  } catch (error) {
    // The connection may be in an unknown state after a mid-operation failure,
    // so it is retired rather than returned to the pool.
    failed = true;
    throw error;
  } finally {
    await release(failed);
  }
}
