import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closePool, pool } from "./database/pool.js";
import { assertSchemaReady } from "./database/schema.js";

const server = createServer(app);

async function start(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    const schema = await assertSchemaReady();
    server.listen(env.PORT, "0.0.0.0", () => {
      console.log(`Orbit API listening on http://127.0.0.1:${env.PORT} (schema ${schema.latestMigration})`);
    });
  } catch (error) {
    console.error("Orbit API startup readiness check failed", error instanceof Error ? error.message : error);
    await closePool().catch(() => undefined);
    process.exitCode = 1;
  }
}

void start();

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
