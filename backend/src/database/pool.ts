import pg from "pg";
import { env } from "../config/env.js";

const { Pool, types } = pg;

// Return PostgreSQL bigint values as numbers for API counters.
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  application_name: "orbit-api",
  max: env.NODE_ENV === "test" ? 4 : 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  if (env.LOG_LEVEL !== "silent") {
    console.error("Unexpected PostgreSQL pool error", error.message);
  }
});

export async function closePool(): Promise<void> {
  await pool.end();
}
