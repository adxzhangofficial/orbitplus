export type RemoteEntryType = "file" | "directory" | "symlink" | "other";

export interface RemoteEntry {
  name: string;
  path: string;
  type: RemoteEntryType;
  size: number;
  modifiedAt: string;
  permissions?: string;
}

export interface ConnectionHealth {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface RemoteFilesystem {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<ConnectionHealth>;
  list(path: string): Promise<RemoteEntry[]>;
  read(path: string): Promise<Buffer>;
  write(path: string, content: Buffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  delete(path: string, recursive?: boolean): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface ServerConnectionRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  root_path: string;
  adapter_mode: "demo" | "sftp";
  authentication_type: "password" | "privateKey" | "agent";
  credential_ciphertext: string | null;
  host_fingerprint: string | null;
  settings: Record<string, unknown>;
}

export interface ServerCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
  agent?: string;
}
