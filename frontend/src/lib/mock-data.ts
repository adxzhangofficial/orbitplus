import type {
  ActivityEvent,
  Backup,
  Deployment,
  MetricPoint,
  Notification,
  Organization,
  RemoteFile,
  Server,
  TeamMember,
  Transfer,
  User,
} from "@/types";

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const demoCustomer: User = {
  id: "usr_adeel",
  name: "Adeel Khan",
  email: "adeel@acme.dev",
  role: "owner",
  organizationId: "org_acme",
  organizationName: "Acme Engineering",
  plan: "Pro",
};

export const demoAdmin: User = {
  id: "usr_platform",
  name: "Maya Chen",
  email: "admin@orbit.local",
  role: "platform_admin",
  organizationId: "org_orbit",
  organizationName: "Orbit Platform",
  plan: "Enterprise",
};

export const servers: Server[] = [
  {
    id: "srv_prod_01",
    name: "Production API",
    environment: "production",
    status: "online",
    host: "api-01.acme.internal",
    port: 22,
    protocol: "SFTP",
    username: "deploy",
    region: "US East · Virginia",
    provider: "AWS",
    rootPath: "/var/www/api",
    latency: 31,
    cpu: 38,
    memory: 64,
    disk: 47,
    uptime: "99.997%",
    lastSeen: ago(0.2),
    tags: ["api", "production", "critical"],
    starred: true,
    fingerprint: "SHA256:mS4V…zY8p",
  },
  {
    id: "srv_web_01",
    name: "Frontend Cluster",
    environment: "production",
    status: "online",
    host: "web-01.acme.internal",
    port: 22,
    protocol: "SFTP",
    username: "orbit",
    region: "EU West · Ireland",
    provider: "DigitalOcean",
    rootPath: "/home/orbit/apps/web",
    latency: 44,
    cpu: 22,
    memory: 51,
    disk: 36,
    uptime: "99.991%",
    lastSeen: ago(0.5),
    tags: ["web", "production"],
    starred: true,
    fingerprint: "SHA256:6PzA…1QaM",
  },
  {
    id: "srv_stage_01",
    name: "Staging",
    environment: "staging",
    status: "degraded",
    host: "staging.acme.internal",
    port: 2222,
    protocol: "SFTP",
    username: "developer",
    region: "US West · Oregon",
    provider: "Hetzner",
    rootPath: "/srv/staging",
    latency: 118,
    cpu: 81,
    memory: 74,
    disk: 68,
    uptime: "98.72%",
    lastSeen: ago(1),
    tags: ["staging", "shared"],
    fingerprint: "SHA256:B9dt…e2Km",
  },
  {
    id: "srv_db_01",
    name: "Analytics Worker",
    environment: "production",
    status: "maintenance",
    host: "analytics-02.acme.internal",
    port: 22,
    protocol: "SFTP",
    username: "ops",
    region: "Asia Pacific · Singapore",
    provider: "GCP",
    rootPath: "/opt/analytics",
    latency: 76,
    cpu: 0,
    memory: 0,
    disk: 72,
    uptime: "—",
    lastSeen: ago(38),
    tags: ["worker", "maintenance"],
    fingerprint: "SHA256:vf2L…Xm91",
  },
  {
    id: "srv_dev_01",
    name: "Dev Sandbox",
    environment: "development",
    status: "offline",
    host: "devbox.acme.internal",
    port: 22,
    protocol: "SFTP",
    username: "adeel",
    region: "Local network",
    provider: "Bare metal",
    rootPath: "/home/adeel/workspace",
    latency: 0,
    cpu: 0,
    memory: 0,
    disk: 29,
    uptime: "—",
    lastSeen: ago(930),
    tags: ["development", "sandbox"],
  },
];

export const remoteFiles: RemoteFile[] = [
  { id: "f1", name: ".github", path: "/var/www/api/.github", type: "directory", size: 0, permissions: "drwxr-xr-x", modifiedAt: ago(980), owner: "deploy" },
  { id: "f2", name: "config", path: "/var/www/api/config", type: "directory", size: 0, permissions: "drwxr-x---", modifiedAt: ago(21), owner: "deploy" },
  { id: "f3", name: "public", path: "/var/www/api/public", type: "directory", size: 0, permissions: "drwxr-xr-x", modifiedAt: ago(142), owner: "www-data" },
  { id: "f4", name: "src", path: "/var/www/api/src", type: "directory", size: 0, permissions: "drwxr-xr-x", modifiedAt: ago(6), owner: "deploy", gitStatus: "modified" },
  { id: "f5", name: "storage", path: "/var/www/api/storage", type: "directory", size: 0, permissions: "drwxrwx---", modifiedAt: ago(2), owner: "www-data" },
  { id: "f6", name: ".env.production", path: "/var/www/api/.env.production", type: "file", size: 1842, permissions: "-rw-------", modifiedAt: ago(55), owner: "deploy", extension: "env" },
  { id: "f7", name: ".gitignore", path: "/var/www/api/.gitignore", type: "file", size: 426, permissions: "-rw-r--r--", modifiedAt: ago(4032), owner: "deploy", extension: "gitignore" },
  { id: "f8", name: "docker-compose.yml", path: "/var/www/api/docker-compose.yml", type: "file", size: 3118, permissions: "-rw-r--r--", modifiedAt: ago(95), owner: "deploy", extension: "yml", gitStatus: "modified" },
  { id: "f9", name: "package.json", path: "/var/www/api/package.json", type: "file", size: 2286, permissions: "-rw-r--r--", modifiedAt: ago(402), owner: "deploy", extension: "json" },
  { id: "f10", name: "README.md", path: "/var/www/api/README.md", type: "file", size: 9468, permissions: "-rw-r--r--", modifiedAt: ago(832), owner: "deploy", extension: "md" },
  { id: "f11", name: "server.ts", path: "/var/www/api/server.ts", type: "file", size: 6844, permissions: "-rw-r--r--", modifiedAt: ago(6), owner: "deploy", extension: "ts", gitStatus: "modified" },
];

export const sampleFileContent = `import { createServer } from "node:http";
import { app } from "./app.js";
import { logger } from "./lib/logger.js";

const port = Number(process.env.PORT ?? 8080);
const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  logger.info({ port, environment: process.env.NODE_ENV }, "API is ready");
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Graceful shutdown started");
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));`;

export const activities: ActivityEvent[] = [
  { id: "a1", actor: "Adeel Khan", initials: "AK", action: "edited", resource: "server.ts", resourceType: "File", server: "Production API", severity: "info", createdAt: ago(6), ip: "103.21.244.8" },
  { id: "a2", actor: "CI Pipeline", initials: "CI", action: "deployed", resource: "api@4f32c1a", resourceType: "Deployment", server: "Production API", severity: "success", createdAt: ago(17), ip: "10.0.1.24" },
  { id: "a3", actor: "Sara Malik", initials: "SM", action: "restored", resource: "Pre-release snapshot", resourceType: "Backup", server: "Staging", severity: "warning", createdAt: ago(43), ip: "62.31.9.182" },
  { id: "a4", actor: "Orbit Monitor", initials: "OM", action: "detected high CPU on", resource: "Staging", resourceType: "Alert", server: "Staging", severity: "critical", createdAt: ago(68) },
  { id: "a5", actor: "Leon Wu", initials: "LW", action: "connected", resource: "Frontend Cluster", resourceType: "Session", server: "Frontend Cluster", severity: "success", createdAt: ago(124), ip: "87.244.12.3" },
  { id: "a6", actor: "Adeel Khan", initials: "AK", action: "created", resource: "Nightly production", resourceType: "Automation", severity: "info", createdAt: ago(190), ip: "103.21.244.8" },
];

export const transfers: Transfer[] = [
  { id: "t1", name: "release-2026.07.19.tar.gz", server: "Production API", direction: "upload", status: "running", progress: 68, bytes: 147_849_216, totalBytes: 217_432_064, speed: "18.4 MB/s", startedAt: ago(2), eta: "4s" },
  { id: "t2", name: "storage/logs/", server: "Staging", direction: "download", status: "queued", progress: 0, bytes: 0, totalBytes: 984_234_112, speed: "—", startedAt: ago(1) },
  { id: "t3", name: "public/assets/", server: "Frontend Cluster", direction: "sync", status: "complete", progress: 100, bytes: 67_108_864, totalBytes: 67_108_864, speed: "24.1 MB/s", startedAt: ago(47) },
  { id: "t4", name: "analytics-model.bin", server: "Analytics Worker", direction: "upload", status: "failed", progress: 32, bytes: 343_932_928, totalBytes: 1_073_741_824, speed: "0 B/s", startedAt: ago(92) },
];

export const backups: Backup[] = [
  { id: "b1", name: "Nightly · Production API", server: "Production API", type: "incremental", status: "complete", size: 4_831_838_208, files: 12844, createdAt: ago(480), retentionUntil: new Date(now + 29 * 86_400_000).toISOString(), encrypted: true },
  { id: "b2", name: "Pre-release · Frontend", server: "Frontend Cluster", type: "snapshot", status: "complete", size: 1_288_490_188, files: 3241, createdAt: ago(1180), retentionUntil: new Date(now + 13 * 86_400_000).toISOString(), encrypted: true },
  { id: "b3", name: "Weekly full · Production", server: "Production API", type: "full", status: "running", size: 7_301_685_248, files: 18249, createdAt: ago(4), retentionUntil: new Date(now + 89 * 86_400_000).toISOString(), encrypted: true },
  { id: "b4", name: "Staging snapshot", server: "Staging", type: "snapshot", status: "failed", size: 0, files: 0, createdAt: ago(1890), retentionUntil: new Date(now + 6 * 86_400_000).toISOString(), encrypted: true },
];

export const deployments: Deployment[] = [
  { id: "d1", project: "acme-api", environment: "Production", branch: "main", commit: "4f32c1a", author: "CI Pipeline", status: "ready", duration: "1m 42s", createdAt: ago(17) },
  { id: "d2", project: "acme-web", environment: "Production", branch: "main", commit: "9d88a04", author: "Leon Wu", status: "ready", duration: "54s", createdAt: ago(84) },
  { id: "d3", project: "billing-worker", environment: "Staging", branch: "feat/tax-v2", commit: "a110bc8", author: "Sara Malik", status: "building", duration: "42s", createdAt: ago(1) },
  { id: "d4", project: "acme-api", environment: "Staging", branch: "fix/rate-limits", commit: "e81f911", author: "Adeel Khan", status: "failed", duration: "31s", createdAt: ago(326) },
];

export const metrics: MetricPoint[] = Array.from({ length: 24 }, (_, index) => ({
  time: `${String(index).padStart(2, "0")}:00`,
  cpu: Math.round(28 + Math.sin(index / 2.2) * 15 + ((index * 7) % 11)),
  memory: Math.round(54 + Math.sin(index / 4) * 8 + ((index * 3) % 6)),
  network: Math.round(36 + Math.cos(index / 2.8) * 21 + ((index * 5) % 13)),
}));

export const notifications: Notification[] = [
  { id: "n1", title: "CPU threshold exceeded", body: "Staging sustained 81% CPU for more than 10 minutes.", type: "critical", read: false, createdAt: ago(8) },
  { id: "n2", title: "Production deployment complete", body: "acme-api@4f32c1a is healthy across all checks.", type: "success", read: false, createdAt: ago(17) },
  { id: "n3", title: "Backup retention notice", body: "Two snapshots will expire in the next seven days.", type: "warning", read: false, createdAt: ago(91) },
  { id: "n4", title: "New sign-in from Singapore", body: "A new trusted session was approved for Leon Wu.", type: "info", read: true, createdAt: ago(226) },
];

export const team: TeamMember[] = [
  { id: "m1", name: "Adeel Khan", email: "adeel@acme.dev", role: "owner", status: "active", lastActive: ago(2), servers: 5, mfa: true },
  { id: "m2", name: "Sara Malik", email: "sara@acme.dev", role: "admin", status: "active", lastActive: ago(28), servers: 5, mfa: true },
  { id: "m3", name: "Leon Wu", email: "leon@acme.dev", role: "developer", status: "active", lastActive: ago(84), servers: 3, mfa: true },
  { id: "m4", name: "Priya Shah", email: "priya@acme.dev", role: "operator", status: "active", lastActive: ago(338), servers: 4, mfa: false },
  { id: "m5", name: "Noah Williams", email: "noah@acme.dev", role: "viewer", status: "invited", lastActive: ago(3880), servers: 0, mfa: false },
];

export const organizations: Organization[] = [
  { id: "o1", name: "Acme Engineering", slug: "acme", plan: "Pro", members: 8, servers: 14, usage: 72, status: "active", mrr: 189, joinedAt: ago(94_500) },
  { id: "o2", name: "Northstar Labs", slug: "northstar", plan: "Enterprise", members: 42, servers: 83, usage: 61, status: "active", mrr: 2400, joinedAt: ago(290_000) },
  { id: "o3", name: "Polaris Commerce", slug: "polaris", plan: "Pro", members: 15, servers: 27, usage: 94, status: "past_due", mrr: 429, joinedAt: ago(151_000) },
  { id: "o4", name: "Juniper Studio", slug: "juniper", plan: "Free", members: 2, servers: 1, usage: 38, status: "trial", mrr: 0, joinedAt: ago(11_400) },
  { id: "o5", name: "Vector Health", slug: "vector", plan: "Enterprise", members: 68, servers: 121, usage: 79, status: "active", mrr: 5200, joinedAt: ago(402_000) },
  { id: "o6", name: "Monarch Systems", slug: "monarch", plan: "Pro", members: 6, servers: 9, usage: 21, status: "suspended", mrr: 129, joinedAt: ago(211_000) },
];

export const terminalLines = [
  { type: "prompt", value: "deploy@api-01:/var/www/api$ uptime" },
  { type: "output", value: " 02:14:42 up 127 days,  8:31,  2 users,  load average: 0.42, 0.38, 0.31" },
  { type: "prompt", value: "deploy@api-01:/var/www/api$ git status --short" },
  { type: "output", value: " M src/server.ts\n M docker-compose.yml" },
  { type: "prompt", value: "deploy@api-01:/var/www/api$ node --version" },
  { type: "output", value: "v22.20.0" },
];
