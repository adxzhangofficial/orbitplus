import { createHash } from "node:crypto";
import type { Request } from "express";
import { pool } from "../database/pool.js";

/**
 * Records what a platform operator did.
 *
 * Kept apart from tenant audit because the two answer different questions. A
 * customer's audit shows what happened inside their workspace; this shows what
 * someone with access to every workspace did, which is the record that matters
 * when the question is whether that access was used appropriately.
 *
 * Writes are best-effort at the call site but never silent: a failure is logged
 * rather than swallowed, because an action that happened without a record is
 * worse than an action that failed.
 */

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string;
  organizationId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function recordPlatformAction(request: Request, input: AuditInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO platform_audit(actor_id, actor_email, action, target_type, target_id, organization_id, reason, metadata, ip)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        request.auth?.userId ?? null,
        request.auth?.email ?? "unknown",
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.organizationId ?? null,
        input.reason ?? null,
        JSON.stringify(input.metadata ?? {}),
        request.ip ?? null,
      ],
    );
  } catch (error) {
    console.error("Platform audit write failed", {
      action: input.action,
      target: `${input.targetType}:${input.targetId ?? ""}`,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Whether a feature is on for one organization.
 *
 * Rollout assignment hashes the organization id rather than sampling randomly,
 * so a tenant either has a feature or does not. Random assignment per request
 * would make a partially rolled-out feature appear and disappear as someone
 * clicks around, which is far worse than not having it.
 */
export async function isFeatureEnabled(key: string, organizationId: string): Promise<boolean> {
  const result = await pool.query<{
    enabled: boolean; rollout_percent: number;
    enabled_organizations: string[]; disabled_organizations: string[];
  }>(
    "SELECT enabled, rollout_percent, enabled_organizations, disabled_organizations FROM feature_flags WHERE key = $1",
    [key],
  );
  const flag = result.rows[0];
  if (!flag) return false;

  // Explicit lists win over everything, and "off" wins over "on" so a customer
  // who must be kept off a feature cannot be caught by a later rollout change.
  if (flag.disabled_organizations.includes(organizationId)) return false;
  if (flag.enabled_organizations.includes(organizationId)) return true;
  if (!flag.enabled) return false;
  if (flag.rollout_percent >= 100) return true;
  if (flag.rollout_percent <= 0) return false;

  const bucket = createHash("sha256").update(`${key}:${organizationId}`).digest()[0]! % 100;
  return bucket < flag.rollout_percent;
}
