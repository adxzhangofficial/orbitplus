import type { Role, ServerStatus } from "@/types";

/**
 * Type definitions for platform-admin views whose backend endpoints do not
 * exist yet.
 *
 * This file previously exported fabricated organizations, users, jobs,
 * incidents, support tickets, feature flags, and announcements, which rendered
 * as though the platform were populated and operating. Every collection is now
 * empty, so those pages show their empty state and say plainly that the API is
 * not available rather than presenting invented records as real ones.
 *
 * Pages backed by an endpoint that does exist (organizations, users, servers,
 * audit, backups, revenue, system) read it through `_api.tsx` instead.
 */

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
export const platformUsers: PlatformUser[] = [];

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
export const fleetServers: FleetServer[] = [];

export type JobState = "queued" | "running" | "complete" | "failed" | "cancelled" | "retrying";
export interface PlatformJob {
  id: string; type: string; name: string; organization: string; target: string;
  status: JobState; progress: number; attempts: number; worker: string;
  createdAt: string; duration: string;
}
export const platformJobs: PlatformJob[] = [];

export interface PlatformBackup {
  id: string; name: string; server: string; organization: string;
  type: "full" | "snapshot" | "incremental"; status: "complete" | "scheduled" | "running" | "failed";
  size: number; files: number; createdAt: string; retentionUntil: string;
  encrypted: boolean; region: string; checksum: string;
}
export const platformBackups: PlatformBackup[] = [];

export interface Incident {
  id: string; title: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "investigating" | "monitoring" | "resolved";
  source: string; organization: string; assignee: string; createdAt: string; evidence: string[];
}
export const incidents: Incident[] = [];

export interface AuditEvent {
  id: string; actor: string; action: string; category: string; organization: string;
  target: string; ip: string; severity: string; createdAt: string; requestId: string;
  metadata: Record<string, unknown>;
}
export const auditEvents: AuditEvent[] = [];

export interface SupportTicket {
  id: string; subject: string; customer: string; plan: "Free" | "Pro" | "Enterprise";
  priority: "urgent" | "high" | "normal" | "low"; status: "open" | "pending" | "closed";
  assignee: string; updatedAt: string; slaMinutes: number; channel: string; messages: number;
}
export const supportTickets: SupportTicket[] = [];

export interface FeatureFlag {
  id: string; key: string; name: string; description: string; owner: string;
  production: boolean; staging: boolean; rollout: number; targets: number;
  updatedAt: string; risk: "low" | "medium" | "high";
}
export const featureFlags: FeatureFlag[] = [];

export interface Announcement {
  id: string; title: string; audience: string; channel: string;
  status: "draft" | "scheduled" | "published"; author: string; publishAt: string;
  views: number; clicks: number; body: string;
}
export const announcements: Announcement[] = [];

export interface SubscriptionRow {
  id: string; organization: string; plan: string; status: string;
  mrr: number; seats: number; renewal: string; method: string;
}
export const subscriptionRows: SubscriptionRow[] = [];
