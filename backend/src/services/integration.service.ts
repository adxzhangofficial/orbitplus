import { createHmac, randomBytes } from "node:crypto";
import { resolveAllowedSftpAddress } from "../adapters/egress-policy.js";
import { pool } from "../database/pool.js";
import { decryptJson, encryptJson } from "../lib/crypto.js";
import { badRequest } from "../lib/errors.js";

/**
 * Outbound event delivery.
 *
 * Every event carries the same payload regardless of destination; only the
 * envelope differs, because Slack and Discord expect their own shapes while a
 * plain webhook receives the event itself.
 */

export const INTEGRATION_EVENTS = [
  "alert.opened", "alert.resolved",
  "transfer.completed", "transfer.failed",
  "backup.completed", "backup.failed",
  "deployment.succeeded", "deployment.failed",
  "server.offline", "server.online",
] as const;

export type IntegrationEvent = typeof INTEGRATION_EVENTS[number];

export interface EventPayload {
  event: IntegrationEvent;
  organizationId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical" | "success";
  resource?: { type: string; id: string; name?: string };
  occurredAt: string;
}

interface IntegrationRow {
  id: string;
  organization_id: string;
  kind: "webhook" | "slack" | "discord";
  name: string;
  target_ciphertext: string;
  events: string[];
  signing_secret_ciphertext: string | null;
  consecutive_failures: number;
}

/** After this many consecutive failures an integration stops being attempted. */
const FAILURE_LIMIT = 15;
const TIMEOUT_MS = 10_000;

/**
 * Validates a destination before it is ever stored.
 *
 * Reusing the SFTP egress policy is deliberate: without it, an integration URL
 * is a request-forgery primitive. Anyone could point one at loopback or at a
 * cloud metadata endpoint and have the server fetch it on their behalf.
 */
export async function assertDeliverableUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { throw badRequest("Enter a valid URL"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw badRequest("Only http and https destinations are supported");
  }
  await resolveAllowedSftpAddress(url.hostname);
  return url;
}

/**
 * A recognisable label that is not the credential.
 *
 * For Slack and Discord the URL is itself the secret, so the path is always
 * reduced rather than only when it happens to be long. An earlier version
 * returned short paths verbatim, which put the whole destination in a field
 * the interface displays.
 */
export function hintFor(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return url.host;
  const last = segments.at(-1)!;
  // Enough of the final segment to tell two destinations apart, never enough
  // to reconstruct one.
  const tail = last.length > 4 ? `…${last.slice(-4)}` : "…";
  return `${url.host}/${segments.length > 1 ? "…/" : ""}${tail}`;
}

export function newSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Slack renders attachments; a bare message would lose the context entirely. */
function slackBody(payload: EventPayload): unknown {
  const color = payload.severity === "critical" ? "#f87171"
    : payload.severity === "warning" ? "#fbbf24"
    : payload.severity === "success" ? "#4ade80"
    : "#60a5fa";
  return {
    text: payload.title,
    attachments: [{
      color,
      title: payload.title,
      text: payload.message,
      fields: [
        { title: "Event", value: payload.event, short: true },
        ...(payload.resource ? [{ title: payload.resource.type, value: payload.resource.name ?? payload.resource.id, short: true }] : []),
      ],
      footer: "Orbit+",
      ts: Math.floor(new Date(payload.occurredAt).getTime() / 1000),
    }],
  };
}

function discordBody(payload: EventPayload): unknown {
  const color = payload.severity === "critical" ? 0xf87171
    : payload.severity === "warning" ? 0xfbbf24
    : payload.severity === "success" ? 0x4ade80
    : 0x60a5fa;
  return {
    embeds: [{
      title: payload.title,
      description: payload.message,
      color,
      timestamp: payload.occurredAt,
      footer: { text: `Orbit+ · ${payload.event}` },
      ...(payload.resource ? { fields: [{ name: payload.resource.type, value: payload.resource.name ?? payload.resource.id, inline: true }] } : {}),
    }],
  };
}

export function signPayload(secret: string, timestamp: string, body: string): string {
  // Timestamp is inside the signed material so a captured delivery cannot be
  // replayed later with its signature still valid.
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

async function deliverOne(integration: IntegrationRow, payload: EventPayload): Promise<{ status: "delivered" | "failed"; responseStatus?: number; error?: string; durationMs: number }> {
  const started = Date.now();
  const target = decryptJson<{ url: string }>(integration.target_ciphertext).url;

  let url: URL;
  try { url = await assertDeliverableUrl(target); }
  catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Destination is not deliverable", durationMs: Date.now() - started };
  }

  const body = JSON.stringify(
    integration.kind === "slack" ? slackBody(payload)
      : integration.kind === "discord" ? discordBody(payload)
      : payload,
  );

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "Orbit-Integrations/1.0",
  };
  if (integration.kind === "webhook" && integration.signing_secret_ciphertext) {
    const secret = decryptJson<{ secret: string }>(integration.signing_secret_ciphertext).secret;
    const timestamp = String(Math.floor(Date.now() / 1000));
    headers["x-orbit-timestamp"] = timestamp;
    headers["x-orbit-signature"] = `v1=${signPayload(secret, timestamp, body)}`;
    headers["x-orbit-event"] = payload.event;
  }

  try {
    const response = await fetch(url.toString(), {
      method: "POST", headers, body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        status: "failed",
        responseStatus: response.status,
        error: (await response.text().catch(() => "")).slice(0, 300) || `Responded ${response.status}`,
        durationMs: Date.now() - started,
      };
    }
    return { status: "delivered", responseStatus: response.status, durationMs: Date.now() - started };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Delivery failed",
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Sends one event to every integration in an organization that wants it.
 *
 * Never throws. An integration that stops responding must not fail the backup
 * or transfer that produced the event, so failures are recorded and the caller
 * continues.
 */
export async function dispatchEvent(payload: EventPayload): Promise<{ delivered: number; failed: number }> {
  const rows = await pool.query<IntegrationRow>(
    `SELECT id, organization_id, kind, name, target_ciphertext, events, signing_secret_ciphertext, consecutive_failures
       FROM integrations
      WHERE organization_id = $1 AND enabled = true
        AND (cardinality(events) = 0 OR $2 = ANY(events))`,
    [payload.organizationId, payload.event],
  );

  let delivered = 0;
  let failed = 0;

  for (const integration of rows.rows) {
    // A destination that has been failing for a long time is left alone rather
    // than retried on every event, which would spend the worker's time on a
    // channel nobody is reading.
    if (integration.consecutive_failures >= FAILURE_LIMIT) {
      await pool.query(
        `INSERT INTO integration_deliveries(integration_id, organization_id, event, status, error_message)
         VALUES($1, $2, $3, 'skipped', 'Disabled after repeated failures')`,
        [integration.id, integration.organization_id, payload.event],
      ).catch(() => undefined);
      continue;
    }

    const result = await deliverOne(integration, payload);
    if (result.status === "delivered") delivered += 1; else failed += 1;

    await pool.query(
      `INSERT INTO integration_deliveries(integration_id, organization_id, event, status, response_status, error_message, duration_ms)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [integration.id, integration.organization_id, payload.event, result.status, result.responseStatus ?? null, result.error ?? null, result.durationMs],
    ).catch(() => undefined);

    await pool.query(
      `UPDATE integrations SET
         last_delivery_at = now(), last_status = $2, last_error = $3,
         delivery_count = delivery_count + 1,
         consecutive_failures = CASE WHEN $2 = 'delivered' THEN 0 ELSE consecutive_failures + 1 END,
         updated_at = now()
       WHERE id = $1`,
      [integration.id, result.status, result.error ?? null],
    ).catch(() => undefined);
  }

  return { delivered, failed };
}

export function encryptTarget(url: string): string {
  return encryptJson({ url });
}

export function encryptSigningSecret(secret: string): string {
  return encryptJson({ secret });
}
