import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudOff, Radio } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { StatusPill } from "./_shared";

export type AdminDataSource = "loading" | "live" | "demo" | "error";

export interface AdminCustomer {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "trialing" | "suspended" | "cancelled";
  createdAt: string;
  members: number;
  workspaces?: number;
  servers: number;
  backupBytes?: string | number;
}

export interface AdminCustomerDetail {
  organization: AdminCustomer & {
    settings?: Record<string, unknown>;
    updatedAt?: string;
  };
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: "owner" | "admin" | "developer" | "operator" | "viewer";
    status: string;
    joinedAt: string;
  }>;
  servers: Array<{
    id: string;
    name: string;
    host: string;
    environment: string;
    status: "online" | "offline" | "degraded" | "unknown" | "maintenance";
    lastCheckedAt?: string;
  }>;
  usage: { transfers: number; backups: number; deployments: number };
  recentActivity: Array<{
    id: string;
    action: string;
    resourceType: string;
    createdAt: string;
  }>;
}

export interface AdminOverview {
  counts: {
    users: number;
    organizations: number;
    servers: number;
    activeTransfers: number;
    criticalAlerts: number;
    suspendedOrganizations: number;
  };
  revenue: {
    monthlyRecurringCents: number;
    free: number;
    pro: number;
    enterprise: number;
  };
  growth: Array<{ date: string; organizations: number }>;
  infrastructure: { online: number; offline: number; unknown: number };
  recentCustomers: AdminCustomer[];
}

export interface AdminAuditEvent {
  id: string;
  organizationId?: string;
  organization?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  actor?: string;
}

export interface AdminSystem {
  api: {
    status: string;
    uptimeSeconds: number;
    memory: { rss: number; heapTotal: number; heapUsed: number; external?: number };
    nodeVersion: string;
  };
  database: {
    database: string;
    version: string;
    sizeBytes: string | number;
    serverTime: string;
    latencyMs: number;
  };
  queue: { failedTransfers: number; runningTransfers: number };
  tables: Array<{ table: string; estimatedRows: number }>;
  migrations: Array<{ name: string; appliedAt: string }>;
}

export interface AdminDirectory {
  customers: AdminCustomer[];
  details: AdminCustomerDetail[];
}

export interface AdminFeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  enabledOrganizations: string[];
  disabledOrganizations: string[];
  updatedAt: string;
}

export interface FeatureFlagInput {
  name: string;
  description?: string;
  enabled?: boolean;
  rolloutPercent?: number;
  enabledOrganizations?: string[];
  disabledOrganizations?: string[];
}

export interface AdminTicket {
  id: string;
  subject: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
  organizationName: string | null;
  plan: string | null;
  openedByName: string | null;
  assignedToName: string | null;
  messageCount: number;
}

export interface AdminTicketDetail extends AdminTicket {
  body: string;
  organizationId: string | null;
  messages: Array<{ id: number; body: string; authorRole: "customer" | "operator"; authorName: string | null; createdAt: string }>;
}

export interface AdminQueue {
  name: string;
  ready: number;
  active: number;
  deferred: number;
  failed: number;
  total: number;
}

export interface PlatformAuditEntry {
  id: number;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
  organizationName: string | null;
}

export const adminApi = {
  overview: () => api.get<AdminOverview>("/admin/overview"),
  customers: () => api.get<AdminCustomer[]>("/admin/customers?limit=100"),
  customer: (id: string) => api.get<AdminCustomerDetail>(`/admin/customers/${encodeURIComponent(id)}`),
  updateCustomer: (id: string, input: { plan?: AdminCustomer["plan"]; status?: AdminCustomer["status"] }) => api.patch<Pick<AdminCustomer, "id" | "name" | "slug" | "plan" | "status">>(`/admin/customers/${encodeURIComponent(id)}`, input),
  activity: () => api.get<AdminAuditEvent[]>("/admin/activity?limit=100"),
  system: () => api.get<AdminSystem>("/admin/system"),
  // Write operations. Each requires a reason, which the API enforces and which
  // ends up in the platform audit record.
  suspendOrganization: (id: string, reason: string) => api.post(`/admin/organizations/${encodeURIComponent(id)}/suspend`, { reason }),
  restoreOrganization: (id: string, reason: string) => api.post(`/admin/organizations/${encodeURIComponent(id)}/restore`, { reason }),
  suspendUser: (id: string, reason: string) => api.post(`/admin/users/${encodeURIComponent(id)}/suspend`, { reason }),
  restoreUser: (id: string, reason: string) => api.post(`/admin/users/${encodeURIComponent(id)}/restore`, { reason }),
  revokeUserSessions: (id: string, reason: string) => api.post(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { reason }),

  featureFlags: () => api.get<AdminFeatureFlag[]>("/admin/feature-flags"),
  saveFeatureFlag: (key: string, input: FeatureFlagInput) => api.put<AdminFeatureFlag>(`/admin/feature-flags/${encodeURIComponent(key)}`, input),
  deleteFeatureFlag: (key: string) => api.delete(`/admin/feature-flags/${encodeURIComponent(key)}`),

  tickets: (status?: string) => api.get<AdminTicket[]>(`/admin/support/tickets${status ? `?status=${status}` : ""}`),
  ticket: (id: string) => api.get<AdminTicketDetail>(`/admin/support/tickets/${encodeURIComponent(id)}`),
  replyToTicket: (id: string, body: string, status?: string) => api.post(`/admin/support/tickets/${encodeURIComponent(id)}/reply`, { body, status }),

  jobs: () => api.get<AdminQueue[]>("/admin/jobs"),
  platformAudit: (action?: string) => api.get<PlatformAuditEntry[]>(`/admin/platform-audit${action ? `?action=${action}` : ""}`),

  directory: async (): Promise<AdminDirectory> => {
    const customers = await api.get<AdminCustomer[]>("/admin/customers?limit=100");
    const details = await Promise.all(customers.map((customer) => api.get<AdminCustomerDetail>(`/admin/customers/${encodeURIComponent(customer.id)}`)));
    return { customers, details };
  },
};

export function useAdminResource<T>(key: string, fallback: T, loader: () => Promise<T>) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [data, setData] = useState(fallback);
  const [source, setSource] = useState<AdminDataSource>(() => localStorage.getItem("orbit.accessToken") ? "loading" : "demo");
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!localStorage.getItem("orbit.accessToken")) {
      setData(fallbackRef.current);
      setSource("demo");
      setError(undefined);
      return "demo" as const;
    }
    setSource("loading");
    setError(undefined);
    try {
      setData(await loaderRef.current());
      setSource("live");
      return "live" as const;
    } catch (reason) {
      setData(fallbackRef.current);
      setSource("error");
      setError(reason instanceof Error ? reason.message : "The admin API could not be loaded");
      return "error" as const;
    }
  }, [key]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, source, error, refresh };
}

export function AdminDataNotice({ source, error }: { source: AdminDataSource; error?: string }) {
  if (source === "live") return <StatusPill status="active" label="Live admin API" />;
  if (source === "loading") return <StatusPill status="info" label="Loading live data" />;
  if (source === "error") return <div className="adm-notice warning"><AlertTriangle />Live API unavailable: {error}. Showing labeled demo data.</div>;
  return <div className="adm-notice"><CloudOff />Demo data is shown because no authenticated admin session is active.</div>;
}

export function LiveSignal({ source }: { source: AdminDataSource }) {
  return source === "live" ? <span className="flex items-center gap-1 text-emerald-400"><Radio size={11} />Live</span> : <span className="text-zinc-500">Demo</span>;
}

export function unsupported(action: string) {
  toast.info(`${action} is not supported by the current API`, { description: "No server-side change was made." });
}
