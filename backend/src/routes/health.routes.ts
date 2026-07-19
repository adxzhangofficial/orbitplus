import { Router } from "express";
import { pool } from "../database/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { assertSchemaReady } from "../database/schema.js";

export const healthRouter = Router();

healthRouter.get("/health", (_request, response) => {
  response.json({
    data: {
      status: "ok",
      service: "orbit-api",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    },
  });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_request, response) => {
    const started = Date.now();
    await pool.query("SELECT 1");
    const schema = await assertSchemaReady();
    response.json({
      data: {
        status: "ready",
        database: "connected",
        schema,
        latencyMs: Date.now() - started,
      },
    });
  }),
);
