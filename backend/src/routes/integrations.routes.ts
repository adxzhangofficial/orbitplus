import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { requireRole } from "../middleware/auth.js";
import {
  assertDeliverableUrl,
  dispatchEvent,
  encryptSigningSecret,
  encryptTarget,
  hintFor,
  INTEGRATION_EVENTS,
  newSigningSecret,
} from "../services/integration.service.js";

/**
 * Integration management.
 *
 * The destination URL is never returned after creation. For Slack and Discord
 * the URL is itself the credential, so echoing it back would turn a read of
 * this endpoint into credential disclosure.
 */

const SELECT = `id, kind, name, target_hint AS "targetHint", events, enabled,
  last_delivery_at AS "lastDeliveryAt", last_status AS "lastStatus", last_error AS "lastError",
  consecutive_failures AS "consecutiveFailures", delivery_count AS "deliveryCount",
  created_at AS "createdAt"`;

const createSchema = z.object({
  kind: z.enum(["webhook", "slack", "discord"]),
  name: z.string().trim().min(2).max(100),
  url: z.string().trim().min(8).max(2048),
  events: z.array(z.enum(INTEGRATION_EVENTS)).max(INTEGRATION_EVENTS.length).default([]),
});

export const integrationsRouter = Router();

integrationsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT ${SELECT} FROM integrations WHERE organization_id = $1 ORDER BY created_at DESC`,
      [request.tenant!.organizationId],
    );
    response.json({ data: result.rows, meta: { events: INTEGRATION_EVENTS } });
  }),
);

integrationsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = createSchema.parse(request.body);
    // Validated before storage, so an unreachable or forbidden destination is
    // rejected at the point the user can still fix it.
    const url = await assertDeliverableUrl(input.url);

    // Only a plain webhook is signed: Slack and Discord ignore unknown headers
    // and authenticate by possession of the URL.
    const signingSecret = input.kind === "webhook" ? newSigningSecret() : null;

    const result = await pool.query(
      `INSERT INTO integrations(organization_id, kind, name, target_ciphertext, target_hint, events, signing_secret_ciphertext, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${SELECT}`,
      [
        request.tenant!.organizationId, input.kind, input.name,
        encryptTarget(url.toString()), hintFor(url), input.events,
        signingSecret ? encryptSigningSecret(signingSecret) : null,
        request.auth!.userId,
      ],
    );

    response.status(201).json({
      data: {
        ...result.rows[0],
        // Shown once so the receiver can be configured to verify deliveries.
        ...(signingSecret ? { signingSecret, signingSecretNotice: "Copy this now. It is stored encrypted and cannot be shown again." } : {}),
      },
    });
  }),
);

integrationsRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const input = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      events: z.array(z.enum(INTEGRATION_EVENTS)).optional(),
      enabled: z.boolean().optional(),
    }).strict().parse(request.body);

    const result = await pool.query(
      `UPDATE integrations SET
         name = COALESCE($3, name),
         events = COALESCE($4, events),
         enabled = COALESCE($5, enabled),
         -- Re-enabling clears the failure count, so a destination that has
         -- been fixed is attempted again rather than staying suppressed.
         consecutive_failures = CASE WHEN $5 IS TRUE THEN 0 ELSE consecutive_failures END,
         updated_at = now()
       WHERE id = $1 AND organization_id = $2 RETURNING ${SELECT}`,
      [routeParam(request, "id"), request.tenant!.organizationId, input.name ?? null, input.events ?? null, input.enabled ?? null],
    );
    if (!result.rows[0]) throw notFound("Integration");
    response.json({ data: result.rows[0] });
  }),
);

/** Sends a real delivery, so the destination is proven rather than assumed. */
integrationsRouter.post(
  "/:id/test",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const found = await pool.query(
      "SELECT id FROM integrations WHERE id = $1 AND organization_id = $2",
      [routeParam(request, "id"), request.tenant!.organizationId],
    );
    if (!found.rowCount) throw notFound("Integration");

    const result = await dispatchEvent({
      event: "alert.opened",
      organizationId: request.tenant!.organizationId,
      title: "Orbit+ test notification",
      message: `Sent by ${request.auth!.email} to confirm this integration is wired up correctly.`,
      severity: "info",
      occurredAt: new Date().toISOString(),
    });

    const latest = await pool.query(
      `SELECT status, response_status AS "responseStatus", error_message AS "errorMessage", duration_ms AS "durationMs"
         FROM integration_deliveries WHERE integration_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [routeParam(request, "id")],
    );
    response.json({ data: { ...result, delivery: latest.rows[0] } });
  }),
);

/** Recent deliveries, so a silent integration can be diagnosed. */
integrationsRouter.get(
  "/:id/deliveries",
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      `SELECT d.event, d.status, d.response_status AS "responseStatus", d.error_message AS "errorMessage",
              d.duration_ms AS "durationMs", d.created_at AS "createdAt"
         FROM integration_deliveries d
         JOIN integrations i ON i.id = d.integration_id
        WHERE d.integration_id = $1 AND i.organization_id = $2
        ORDER BY d.created_at DESC LIMIT 50`,
      [routeParam(request, "id"), request.tenant!.organizationId],
    );
    response.json({ data: result.rows });
  }),
);

integrationsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (request, response) => {
    const result = await pool.query(
      "DELETE FROM integrations WHERE id = $1 AND organization_id = $2 RETURNING id",
      [routeParam(request, "id"), request.tenant!.organizationId],
    );
    if (!result.rowCount) throw notFound("Integration");
    response.status(204).send();
  }),
);
