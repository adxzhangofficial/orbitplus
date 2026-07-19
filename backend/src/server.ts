import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closePool, pool } from "./database/pool.js";
import { assertSchemaReady } from "./database/schema.js";
import { attachTerminalServer } from "./services/terminal.service.js";
import { logger } from "./lib/logger.js";

const server = createServer(app);

// Shares the API's port and origin, so no additional listener or CORS surface
// is introduced for the terminal.
attachTerminalServer(server);

async function start(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    const schema = await assertSchemaReady();
    server.listen(env.PORT, "0.0.0.0", () => {
      logger.info(`Orbit API listening on http://127.0.0.1:${env.PORT} (schema ${schema.latestMigration})`);
    });
  } catch (error) {
    logger.error("Orbit API startup readiness check failed", { error });
    await closePool().catch(() => undefined);
    process.exitCode = 1;
  }
}

void start();

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received; shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
