export type Role = "owner" | "admin" | "developer" | "operator" | "viewer" | "platform_admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  organizationId: string;
  organizationName: string;
  plan: "Free" | "Pro" | "Enterprise";
}

export type ServerStatus = "online" | "degraded" | "offline" | "maintenance" | "unknown";

export interface Server {
  id: string;
  name: string;
  environment: "production" | "staging" | "development";
  status: ServerStatus;
  host: string;
  port: number;
  protocol: "SFTP" | "FTP" | "FTPS";
  username: string;
  region: string;
  provider: string;
  rootPath: string;
  latency: number | null;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  uptime: string;
  lastSeen: string;
  tags: string[];
  starred?: boolean;
  fingerprint?: string;
}

export interface RemoteFile {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  permissions: string;
  modifiedAt: string;
  owner: string;
  extension?: string;
  gitStatus?: "modified" | "added" | "deleted" | "untracked";
}

export interface ActivityEvent {
  id: string;
  actor: string;
  initials: string;
  action: string;
  resource: string;
  resourceType: string;
  server?: string;
  severity: "info" | "success" | "warning" | "critical";
  createdAt: string;
  ip?: string;
}

export interface Transfer {
  id: string;
  name: string;
  server: string;
  direction: "upload" | "download" | "sync";
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  progress: number;
  bytes: number;
  totalBytes: number;
  speed: string;
  startedAt: string;
  eta?: string;
}

export interface Backup {
  id: string;
  name: string;
  server: string;
  type: "full" | "incremental" | "snapshot";
  status: "complete" | "running" | "failed" | "scheduled";
  size: number;
  files: number;
  createdAt: string;
  retentionUntil: string;
  encrypted: boolean;
}

export interface Deployment {
  id: string;
  project: string;
  environment: string;
  branch: string;
  commit: string;
  author: string;
  status: "ready" | "building" | "failed" | "cancelled";
  duration: string;
  createdAt: string;
}

export interface MetricPoint {
  time: string;
  cpu: number;
  memory: number;
  network: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "warning" | "critical";
  read: boolean;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  lastActive: string;
  servers: number;
  mfa: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: "Free" | "Pro" | "Enterprise";
  members: number;
  servers: number;
  usage: number;
  status: "active" | "trial" | "past_due" | "suspended";
  mrr: number;
  joinedAt: string;
}
