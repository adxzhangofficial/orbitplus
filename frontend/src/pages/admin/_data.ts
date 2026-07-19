import { activities, backups, deployments, organizations, servers, transfers } from "@/lib/mock-data";
import type { Role, ServerStatus } from "@/types";

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  lastActive: string;
  mfa: boolean;
  sessions: number;
  joinedAt: string;
  risk: "low" | "medium" | "high";
}

export const platformUsers: PlatformUser[] = [
  { id: "u_01", name: "Adeel Khan", email: "adeel@acme.dev", organization: "Acme Engineering", role: "owner", status: "active", lastActive: ago(2), mfa: true, sessions: 3, joinedAt: ago(94_500), risk: "low" },
  { id: "u_02", name: "Sara Malik", email: "sara@acme.dev", organization: "Acme Engineering", role: "admin", status: "active", lastActive: ago(28), mfa: true, sessions: 2, joinedAt: ago(88_320), risk: "low" },
  { id: "u_03", name: "Leon Wu", email: "leon@acme.dev", organization: "Acme Engineering", role: "developer", status: "active", lastActive: ago(84), mfa: true, sessions: 1, joinedAt: ago(72_900), risk: "low" },
  { id: "u_04", name: "Mina Okafor", email: "mina@northstar.io", organization: "Northstar Labs", role: "owner", status: "active", lastActive: ago(4), mfa: true, sessions: 4, joinedAt: ago(290_000), risk: "low" },
  { id: "u_05", name: "Jon Bell", email: "jon@northstar.io", organization: "Northstar Labs", role: "operator", status: "active", lastActive: ago(310), mfa: false, sessions: 1, joinedAt: ago(182_800), risk: "medium" },
  { id: "u_06", name: "Amelia Stone", email: "amelia@polaris.shop", organization: "Polaris Commerce", role: "owner", status: "active", lastActive: ago(46), mfa: true, sessions: 2, joinedAt: ago(151_000), risk: "medium" },
  { id: "u_07", name: "Kenji Mori", email: "kenji@polaris.shop", organization: "Polaris Commerce", role: "developer", status: "suspended", lastActive: ago(8220), mfa: false, sessions: 0, joinedAt: ago(122_000), risk: "high" },
  { id: "u_08", name: "Eva Duarte", email: "eva@juniper.studio", organization: "Juniper Studio", role: "owner", status: "active", lastActive: ago(580), mfa: false, sessions: 1, joinedAt: ago(11_400), risk: "medium" },
  { id: "u_09", name: "Camille Reed", email: "camille@vector.health", organization: "Vector Health", role: "admin", status: "active", lastActive: ago(7), mfa: true, sessions: 5, joinedAt: ago(367_000), risk: "low" },
  { id: "u_10", name: "Omar Ali", email: "omar@vector.health", organization: "Vector Health", role: "viewer", status: "invited", lastActive: ago(1440), mfa: false, sessions: 0, joinedAt: ago(1440), risk: "low" },
  { id: "u_11", name: "Riley Fox", email: "riley@monarch.systems", organization: "Monarch Systems", role: "owner", status: "suspended", lastActive: ago(6800), mfa: true, sessions: 0, joinedAt: ago(211_000), risk: "high" },
  { id: "u_12", name: "Nadia Park", email: "nadia@vector.health", organization: "Vector Health", role: "operator", status: "active", lastActive: ago(17), mfa: true, sessions: 2, joinedAt: ago(161_000), risk: "low" },
];

export interface FleetServer {
  id: string;
  name: string;
  organization: string;
  environment: string;
  status: ServerStatus;
  host: string;
  protocol: string;
  region: string;
  provider: string;
  latency: number;
  cpu: number;
  memory: number;
  disk: number;
  sessions: number;
  lastSeen: string;
  version: string;
}

const serverOwners = ["Acme Engineering", "Acme Engineering", "Acme Engineering", "Northstar Labs", "Juniper Studio"];
export const fleetServers: FleetServer[] = [
  ...servers.map((server, index) => ({ ...server, organization: serverOwners[index], sessions: server.status === "online" ? 3 + index : 0, version: index === 2 ? "1.14.8" : "1.16.3" })),
  { id: "srv_ns_01", name: "Northstar Edge", organization: "Northstar Labs", environment: "production", status: "online", host: "edge-01.northstar.internal", protocol: "SFTP", region: "US Central · Iowa", provider: "GCP", latency: 28, cpu: 44, memory: 57, disk: 61, sessions: 12, lastSeen: ago(0.1), version: "1.16.3" },
  { id: "srv_vec_01", name: "Vector Clinical", organization: "Vector Health", environment: "production", status: "online", host: "sftp.vector.health", protocol: "SFTP", region: "US East · Ohio", provider: "AWS", latency: 35, cpu: 51, memory: 69, disk: 43, sessions: 18, lastSeen: ago(0.2), version: "1.16.3" },
  { id: "srv_pol_01", name: "Polaris Assets", organization: "Polaris Commerce", environment: "production", status: "degraded", host: "assets.polaris.shop", protocol: "FTPS", region: "EU Central · Frankfurt", provider: "Azure", latency: 164, cpu: 87, memory: 81, disk: 78, sessions: 7, lastSeen: ago(2), version: "1.15.1" },
  { id: "srv_mon_01", name: "Monarch Archive", organization: "Monarch Systems", environment: "production", status: "offline", host: "archive.monarch.systems", protocol: "SFTP", region: "US West · Oregon", provider: "AWS", latency: 0, cpu: 0, memory: 0, disk: 92, sessions: 0, lastSeen: ago(367), version: "1.13.9" },
];

export type JobState = "queued" | "running" | "complete" | "failed" | "cancelled" | "retrying";
export interface PlatformJob { id: string; type: string; name: string; organization: string; target: string; status: JobState; progress: number; attempts: number; worker: string; createdAt: string; duration: string; }
export const platformJobs: PlatformJob[] = [
  ...transfers.map((transfer, index) => ({ id: transfer.id, type: transfer.direction, name: transfer.name, organization: ["Acme Engineering", "Acme Engineering", "Acme Engineering", "Northstar Labs"][index], target: transfer.server, status: transfer.status as JobState, progress: transfer.progress, attempts: transfer.status === "failed" ? 3 : 1, worker: transfer.status === "queued" ? "Unassigned" : `transfer-${index + 1}`, createdAt: transfer.startedAt, duration: transfer.eta ?? (transfer.status === "complete" ? "2m 18s" : "—") })),
  ...deployments.map((deployment, index) => ({ id: deployment.id, type: "deployment", name: `${deployment.project}@${deployment.commit}`, organization: index === 2 ? "Polaris Commerce" : "Acme Engineering", target: deployment.environment, status: deployment.status === "ready" ? "complete" as const : deployment.status as JobState, progress: deployment.status === "ready" ? 100 : deployment.status === "building" ? 62 : 18, attempts: deployment.status === "failed" ? 2 : 1, worker: `deploy-${index + 2}`, createdAt: deployment.createdAt, duration: deployment.duration })),
  { id: "j_09", type: "backup", name: "vector-nightly-full", organization: "Vector Health", target: "Vector Clinical", status: "running", progress: 41, attempts: 1, worker: "backup-03", createdAt: ago(7), duration: "6m 21s" },
  { id: "j_10", type: "sync", name: "catalog-assets-eu", organization: "Polaris Commerce", target: "Polaris Assets", status: "retrying", progress: 27, attempts: 2, worker: "sync-08", createdAt: ago(12), duration: "4m 08s" },
  { id: "j_11", type: "cleanup", name: "expired-snapshots", organization: "Orbit Platform", target: "storage-eu-2", status: "queued", progress: 0, attempts: 0, worker: "Unassigned", createdAt: ago(1), duration: "—" },
];

export const platformBackups = [
  ...backups.map((backup, index) => ({ ...backup, organization: index === 3 ? "Polaris Commerce" : "Acme Engineering", region: index % 2 ? "eu-west-1" : "us-east-1", checksum: backup.status === "complete" ? `sha256:${backup.id}9a3f…e84c` : "—" })),
  { id: "b5", name: "Clinical records · Nightly", server: "Vector Clinical", organization: "Vector Health", type: "full" as const, status: "complete" as const, size: 18_843_222_016, files: 88421, createdAt: ago(380), retentionUntil: new Date(now + 60 * 86_400_000).toISOString(), encrypted: true, region: "us-east-2", checksum: "sha256:b58a…39f1" },
  { id: "b6", name: "Northstar edge snapshot", server: "Northstar Edge", organization: "Northstar Labs", type: "snapshot" as const, status: "scheduled" as const, size: 0, files: 0, createdAt: ago(1440), retentionUntil: new Date(now + 90 * 86_400_000).toISOString(), encrypted: true, region: "us-central-1", checksum: "—" },
];

export interface Incident { id: string; title: string; severity: "critical" | "high" | "medium" | "low"; status: "open" | "investigating" | "monitoring" | "resolved"; source: string; organization: string; assignee: string; createdAt: string; evidence: string[]; }
export const incidents: Incident[] = [
  { id: "INC-2048", title: "Credential stuffing pattern detected", severity: "critical", status: "investigating", source: "Identity shield", organization: "Polaris Commerce", assignee: "Maya Chen", createdAt: ago(18), evidence: ["184 failed sign-ins from 19 IP addresses", "3 valid usernames enumerated", "No successful access observed"] },
  { id: "INC-2047", title: "Untrusted host fingerprint accepted", severity: "high", status: "open", source: "Connection gateway", organization: "Acme Engineering", assignee: "Unassigned", createdAt: ago(47), evidence: ["Host key changed outside approved window", "Connection blocked by policy"] },
  { id: "INC-2044", title: "Backup export volume anomaly", severity: "medium", status: "monitoring", source: "Behavior analytics", organization: "Vector Health", assignee: "Nadia Park", createdAt: ago(185), evidence: ["Volume 2.8× weekly baseline", "Export originated from known service account"] },
  { id: "INC-2040", title: "Legacy cipher negotiation attempts", severity: "low", status: "resolved", source: "SFTP gateway", organization: "Northstar Labs", assignee: "Maya Chen", createdAt: ago(850), evidence: ["Client pinned to deprecated cipher suite", "Agent updated to 1.16.3"] },
];

export const auditEvents = [
  ...activities.map((activity) => ({ id: activity.id, actor: activity.actor, action: `${activity.action} ${activity.resource}`, category: activity.resourceType, organization: activity.server ? "Acme Engineering" : "Orbit Platform", target: activity.server ?? activity.resource, ip: activity.ip ?? "System", severity: activity.severity, createdAt: activity.createdAt, requestId: `req_${activity.id}f8a2`, metadata: { resource: activity.resource, server: activity.server, actor: activity.actor } })),
  { id: "a7", actor: "Maya Chen", action: "suspended organization", category: "Organization", organization: "Monarch Systems", target: "org_monarch", ip: "172.18.0.14", severity: "warning", createdAt: ago(255), requestId: "req_4e9102", metadata: { reason: "billing_hold", previousStatus: "active" } },
  { id: "a8", actor: "Orbit Security", action: "blocked login challenge", category: "Security", organization: "Polaris Commerce", target: "usr_kenji", ip: "198.51.100.47", severity: "critical", createdAt: ago(47), requestId: "req_51aa8c", metadata: { policy: "impossible_travel", country: "RU" } },
  { id: "a9", actor: "Billing Worker", action: "renewed subscription", category: "Billing", organization: "Vector Health", target: "sub_vector_ent", ip: "System", severity: "success", createdAt: ago(142), requestId: "req_17bd90", metadata: { amount: 5200, currency: "USD" } },
];

export interface SupportTicket { id: string; subject: string; customer: string; plan: "Free" | "Pro" | "Enterprise"; priority: "urgent" | "high" | "normal" | "low"; status: "open" | "pending" | "closed"; assignee: string; updatedAt: string; slaMinutes: number; channel: string; messages: number; }
export const supportTickets: SupportTicket[] = [
  { id: "SUP-1842", subject: "Production sync repeatedly stalls at 92%", customer: "Vector Health", plan: "Enterprise", priority: "urgent", status: "open", assignee: "Maya Chen", updatedAt: ago(6), slaMinutes: 22, channel: "Email", messages: 8 },
  { id: "SUP-1841", subject: "Need audit export for Q2 compliance", customer: "Northstar Labs", plan: "Enterprise", priority: "high", status: "open", assignee: "Jon Bell", updatedAt: ago(18), slaMinutes: 96, channel: "Portal", messages: 3 },
  { id: "SUP-1839", subject: "Cannot update saved host fingerprint", customer: "Acme Engineering", plan: "Pro", priority: "normal", status: "pending", assignee: "Sara Malik", updatedAt: ago(64), slaMinutes: 310, channel: "Chat", messages: 5 },
  { id: "SUP-1836", subject: "Question about storage overage charges", customer: "Polaris Commerce", plan: "Pro", priority: "normal", status: "open", assignee: "Unassigned", updatedAt: ago(122), slaMinutes: 118, channel: "Email", messages: 2 },
  { id: "SUP-1828", subject: "Agent installation on Alpine Linux", customer: "Juniper Studio", plan: "Free", priority: "low", status: "closed", assignee: "Maya Chen", updatedAt: ago(870), slaMinutes: 0, channel: "Portal", messages: 4 },
];

export interface FeatureFlag { id: string; key: string; name: string; description: string; owner: string; production: boolean; staging: boolean; rollout: number; targets: number; updatedAt: string; risk: "low" | "medium" | "high"; }
export const featureFlags: FeatureFlag[] = [
  { id: "flg_1", key: "workspace.delta_sync_v2", name: "Delta sync v2", description: "Chunk-aware resumable synchronization engine.", owner: "Transfer platform", production: true, staging: true, rollout: 68, targets: 4, updatedAt: ago(42), risk: "medium" },
  { id: "flg_2", key: "connections.agentless_gateway", name: "Agentless gateway", description: "Proxy SFTP sessions without a resident agent.", owner: "Connectivity", production: false, staging: true, rollout: 10, targets: 1, updatedAt: ago(180), risk: "high" },
  { id: "flg_3", key: "backups.cross_region_restore", name: "Cross-region restore", description: "Restore snapshots into a different cloud region.", owner: "Storage", production: true, staging: true, rollout: 100, targets: 0, updatedAt: ago(680), risk: "low" },
  { id: "flg_4", key: "security.session_risk_score", name: "Session risk scoring", description: "Real-time adaptive risk policy for new sessions.", owner: "Trust", production: true, staging: true, rollout: 35, targets: 2, updatedAt: ago(16), risk: "medium" },
  { id: "flg_5", key: "billing.usage_commitments", name: "Usage commitments", description: "Annual committed-use contracts for enterprise plans.", owner: "Monetization", production: false, staging: true, rollout: 0, targets: 0, updatedAt: ago(1440), risk: "low" },
];

export interface Announcement { id: string; title: string; audience: string; channel: string; status: "draft" | "scheduled" | "published"; author: string; publishAt: string; views: number; clicks: number; body: string; }
export const announcements: Announcement[] = [
  { id: "ann_01", title: "Delta sync v2 is rolling out", audience: "Pro & Enterprise", channel: "In-app + email", status: "published", author: "Maya Chen", publishAt: ago(2880), views: 1842, clicks: 614, body: "Faster, resumable transfers are now available for eligible workspaces. Existing sync profiles require no changes." },
  { id: "ann_02", title: "Scheduled maintenance · EU gateway", audience: "EU organizations", channel: "Status + email", status: "scheduled", author: "Platform Ops", publishAt: new Date(now + 30 * 60_000).toISOString(), views: 0, clicks: 0, body: "The EU connection gateway will undergo a rolling upgrade. Active SFTP sessions should reconnect automatically." },
  { id: "ann_03", title: "New annual billing options", audience: "Pro", channel: "In-app", status: "draft", author: "Revenue Ops", publishAt: "Not scheduled", views: 0, clicks: 0, body: "Save with annual billing and lock in current workspace pricing." },
];

export const subscriptionRows = organizations.map((organization, index) => ({
  id: `sub_${organization.slug}`,
  organization: organization.name,
  plan: organization.plan,
  status: organization.status,
  mrr: organization.mrr,
  seats: organization.members,
  renewal: new Date(now + (index + 3) * 8 * 86_400_000).toISOString(),
  method: organization.plan === "Enterprise" ? "Invoice · NET 30" : organization.mrr ? "Visa ·· 4242" : "No payment method",
}));
