import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestContext: RequestHandler = (request, response, next) => {
  const incoming = request.header("x-request-id");
  request.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  next();
};
