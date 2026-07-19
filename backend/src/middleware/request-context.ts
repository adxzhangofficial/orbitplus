import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { withLogContext } from "../lib/logger.js";

/**
 * Correlation id for a request.
 *
 * An inbound x-request-id is honoured so a trace started by a load balancer or
 * a calling service continues through Orbit. It is not trusted as-is: the value
 * is echoed in a response header and written into logs, and a header value
 * containing a newline would either be rejected by Node outright — turning a
 * malformed header into a 500 — or split a log line in two, letting a caller
 * forge log entries.
 */

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestContext: RequestHandler = (request, response, next) => {
  const incoming = request.header("x-request-id");
  request.requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  response.setHeader("x-request-id", request.requestId);

  // Everything downstream — routes, services, the error handler — logs with
  // this attached, without having to be passed it.
  withLogContext({ requestId: request.requestId }, next);
};
