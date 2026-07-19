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
    return await operation(adapter);
  } finally {
    await adapter.disconnect();
  }
}
