import { pool } from "../database/pool.js";
import { decryptJson } from "../lib/crypto.js";
import { DemoSftpAdapter } from "./demo-sftp.adapter.js";
import type { RemoteFilesystem, ServerConnectionRecord, ServerCredentials } from "./remote-filesystem.js";
import { SftpAdapter } from "./sftp.adapter.js";

export function adapterFor(server: ServerConnectionRecord): RemoteFilesystem {
  if (server.adapter_mode === "demo") return new DemoSftpAdapter(server);
  const credentials = server.credential_ciphertext
    ? decryptJson<ServerCredentials>(server.credential_ciphertext)
    : {};
  return new SftpAdapter(server, credentials);
}

export async function withAdapter<T>(
  server: ServerConnectionRecord,
  operation: (adapter: RemoteFilesystem) => Promise<T>,
): Promise<T> {
  const adapter = adapterFor(server);
  await adapter.connect();
  try {
    // A server connecting for the first time has no pinned key. The one it
    // presented is recorded now, so every later connection is verified against
    // it and a substituted host is refused.
    if (adapter instanceof SftpAdapter && adapter.capturedFingerprint) {
      await pool.query(
        // Guarded on the column still being empty so a concurrent connection
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
    }
    return await operation(adapter);
  } finally {
    await adapter.disconnect();
  }
}
