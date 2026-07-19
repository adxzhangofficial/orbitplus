import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { routeParam } from "../lib/route-param.js";
import { generateToken, hashToken } from "../lib/tokens.js";
import { requireRole } from "../middleware/auth.js";
import { serverForTenant } from "../services/server.service.js";

export const terminalRouter = Router();

/**
 * Issues a single-use ticket for the WebSocket handshake.
 *
 * A browser cannot set an Authorization header when opening a WebSocket, and
 * putting the access token in the query string would write a live credential
 * into proxy and server logs. This exchanges an authenticated request for a
 * ticket that is valid once, for thirty seconds, for one server.
 *
 * Requires the developer role: opening a shell is the most consequential thing
 * in the product, and read-only members must not be able to.
 */
terminalRouter.post(
  "/tickets",
  requireRole("developer"),
  asyncHandler(async (request, response) => {
    const input = z.object({ serverId: z.string().uuid() }).parse(request.body);
    const server = await serverForTenant(request.tenant!.organizationId, input.serverId);
    if (server.adapter_mode !== "sftp") {
      throw badRequest("The demo adapter has no shell. Connect a real server to use the terminal.");
    }

    const ticket = generateToken();
    await pool.query(
      `INSERT INTO terminal_tickets(token_hash, organization_id, server_id, user_id, expires_at)
       VALUES($1, $2, $3, $4, now() + interval '30 seconds')`,
      [hashToken(ticket), request.tenant!.organizationId, server.id, request.auth!.userId],
    );
    response.status(201).json({ data: { ticket, expiresInSeconds: 30 } });
  }),
);

/** Session history, so past shells are attributable after the fact. */
terminalRouter.get(
  "/sessions",
  asyncHandler(async (request, response) => {
    const serverId = typeof request.query.serverId === "string" ? request.query.serverId : null;
    const result = await pool.query(
      `SELECT t.id, t.server_id AS "serverId", s.name AS "serverName", t.status,
              t.started_at AS "startedAt", t.ended_at AS "endedAt", t.bytes_out AS "bytesOut",
              t.error_message AS "errorMessage", u.name AS "userName", t.client_ip AS "clientIp"
         FROM terminal_sessions t
         LEFT JOIN server_connections s ON s.id = t.server_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.organization_id = $1 AND ($2::uuid IS NULL OR t.server_id = $2)
        ORDER BY t.started_at DESC LIMIT 50`,
      [request.tenant!.organizationId, serverId],
    );
    response.json({ data: result.rows });
  }),
);

/** Full recording of one session, ordered for timed playback. */
terminalRouter.get(
  "/sessions/:id/recording",
  asyncHandler(async (request, response) => {
    const sessionId = routeParam(request, "id");
    const session = await pool.query(
      `SELECT id, started_at AS "startedAt", ended_at AS "endedAt", rows, cols
         FROM terminal_sessions WHERE id = $1 AND organization_id = $2`,
      [sessionId, request.tenant!.organizationId],
    );
    if (!session.rows[0]) throw notFound("Terminal session");

    const chunks = await pool.query(
      `SELECT offset_ms AS "offsetMs", stream, data
         FROM terminal_recordings WHERE session_id = $1 ORDER BY offset_ms, id LIMIT 20000`,
      [sessionId],
    );
    response.json({ data: { session: session.rows[0], chunks: chunks.rows } });
  }),
);
