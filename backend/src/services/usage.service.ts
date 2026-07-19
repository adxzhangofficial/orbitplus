import { pool } from "../database/pool.js";
import { AppError } from "../lib/errors.js";
import { storageUsage } from "./file.service.js";

export type UsageMetric = "sandbox_minutes" | "transfer_bytes" | "storage_bytes" | "api_requests";

export interface PlanLimits {
  plan: string;
  maxServers: number | null;
  maxMembers: number | null;
  maxStorageBytes: number | null;
  maxSandboxMinutes: number | null;
  versionRetentionDays: number | null;
  sandboxInternet: boolean;
  requiresPaymentVerification: boolean;
}

const FALLBACK: PlanLimits = {
  plan: "free",
  maxServers: 1,
  maxMembers: 3,
  maxStorageBytes: 1_073_741_824,
  maxSandboxMinutes: 60,
  versionRetentionDays: 7,
  sandboxInternet: false,
  requiresPaymentVerification: true,
};

export async function planLimits(plan: string): Promise<PlanLimits> {
  const result = await pool.query<{
    plan: string;
    max_servers: number | null;
    max_members: number | null;
    max_storage_bytes: string | null;
    max_sandbox_minutes: number | null;
    version_retention_days: number | null;
    sandbox_internet: boolean;
    requires_payment_verification: boolean;
  }>("SELECT * FROM plan_limits WHERE plan = $1", [plan]);
  const row = result.rows[0];
  // An unknown plan falls back to the most restrictive limits rather than to
  // unlimited, so a bad plan string can never grant free capacity.
  if (!row) return { ...FALLBACK, plan };
  return {
    plan: row.plan,
    maxServers: row.max_servers,
    maxMembers: row.max_members,
    maxStorageBytes: row.max_storage_bytes === null ? null : Number(row.max_storage_bytes),
    maxSandboxMinutes: row.max_sandbox_minutes,
    versionRetentionDays: row.version_retention_days,
    sandboxInternet: row.sandbox_internet,
    requiresPaymentVerification: row.requires_payment_verification,
  };
}

export async function recordUsage(
  organizationId: string,
  metric: UsageMetric,
  quantity: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (quantity <= 0) return;
  await pool.query(
    "INSERT INTO usage_records(organization_id, metric, quantity, metadata) VALUES($1, $2, $3, $4::jsonb)",
    [organizationId, metric, Math.round(quantity), JSON.stringify(metadata)],
  );
}

/** Totals for the current calendar month, which is the billing period. */
export async function currentPeriodUsage(organizationId: string): Promise<Record<UsageMetric, number>> {
  const result = await pool.query<{ metric: UsageMetric; total: string }>(
    `SELECT metric, COALESCE(sum(quantity), 0) AS total
       FROM usage_records
      WHERE organization_id = $1 AND occurred_at >= date_trunc('month', now())
      GROUP BY metric`,
    [organizationId],
  );
  const totals: Record<UsageMetric, number> = {
    sandbox_minutes: 0,
    transfer_bytes: 0,
    storage_bytes: 0,
    api_requests: 0,
  };
  for (const row of result.rows) totals[row.metric] = Number(row.total);
  return totals;
}

export interface UsageSnapshot {
  plan: string;
  limits: PlanLimits;
  servers: number;
  members: number;
  storageBytes: number;
  sandboxMinutes: number;
  transferBytes: number;
}

export async function usageSnapshot(organizationId: string, plan: string): Promise<UsageSnapshot> {
  const [limits, counts, storage, period] = await Promise.all([
    planLimits(plan),
    pool.query<{ servers: number; members: number }>(
      `SELECT
         (SELECT count(*)::integer FROM server_connections WHERE organization_id = $1) AS servers,
         (SELECT count(*)::integer FROM memberships WHERE organization_id = $1 AND status = 'active') AS members`,
      [organizationId],
    ),
    storageUsage(organizationId),
    currentPeriodUsage(organizationId),
  ]);
  return {
    plan,
    limits,
    servers: counts.rows[0]?.servers ?? 0,
    members: counts.rows[0]?.members ?? 0,
    // Storage is billed on distinct stored bytes, which is what deduplication
    // actually leaves on disk, not the sum of every version's logical size.
    storageBytes: storage.blobBytes,
    sandboxMinutes: period.sandbox_minutes,
    transferBytes: period.transfer_bytes,
  };
}

/**
 * Enforced before creating a resource rather than reported after the fact.
 * A null limit means unlimited, which is how enterprise is expressed.
 */
export async function assertWithinLimit(
  organizationId: string,
  plan: string,
  resource: "servers" | "members" | "storage",
): Promise<void> {
  const snapshot = await usageSnapshot(organizationId, plan);
  const checks: Record<typeof resource, { used: number; limit: number | null; label: string }> = {
    servers: { used: snapshot.servers, limit: snapshot.limits.maxServers, label: "server connections" },
    members: { used: snapshot.members, limit: snapshot.limits.maxMembers, label: "team members" },
    storage: { used: snapshot.storageBytes, limit: snapshot.limits.maxStorageBytes, label: "storage" },
  };
  const check = checks[resource];
  if (check.limit !== null && check.used >= check.limit) {
    throw new AppError(
      402,
      "PLAN_LIMIT_REACHED",
      `Your ${plan} plan allows ${check.limit} ${check.label}. Upgrade to add more.`,
      { resource, used: check.used, limit: check.limit, plan },
    );
  }
}
