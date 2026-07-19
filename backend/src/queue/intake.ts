import { pool } from "../database/pool.js";

/**
 * Queue intake control.
 *
 * Pausing holds new work at ingress instead of refusing it. A refusal would
 * surface to the customer as a failed request for something they are entitled
 * to do, and would lose the work; holding it means the operator can drain a
 * queue, replace a worker, or wait out a failing remote host, and the held jobs
 * run when intake resumes.
 *
 * Running jobs are never interrupted. Pausing is about what enters the system,
 * not what is already in it.
 */

const PAUSE_KEY = "queue.intake_paused";

/** Far enough out that nothing runs before an operator resumes intake. */
const HELD_UNTIL = new Date("2999-01-01T00:00:00Z");

/** Marks a job as held by the pause rather than deliberately scheduled. */
export const HELD_MARKER = "__orbitHeldAtIngress";

/**
 * Cached, because enqueue is on the path of every user action that starts work
 * and must not add a database round trip to each one. A few seconds of
 * staleness only means a handful of jobs slip through just after a pause, and
 * those are visible in the queue like any others.
 */
const CACHE_MS = 3_000;
let cachedPaused = false;
let cachedAt = 0;

export function resetIntakeCache(): void {
  cachedAt = 0;
}

export async function isIntakePaused(): Promise<boolean> {
  if (Date.now() - cachedAt < CACHE_MS) return cachedPaused;
  try {
    const result = await pool.query<{ value: boolean }>(
      "SELECT value::text::boolean AS value FROM platform_settings WHERE key = $1",
      [PAUSE_KEY],
    );
    cachedPaused = result.rows[0]?.value ?? false;
    cachedAt = Date.now();
  } catch {
    // A settings read that fails must not stop work being queued. Defaulting to
    // "not paused" keeps the product working; the alternative would turn a
    // transient database blip into a silent, total outage of every background
    // operation.
    cachedPaused = false;
  }
  return cachedPaused;
}

export async function setIntakePaused(paused: boolean, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO platform_settings(key, value, updated_by, updated_at)
     VALUES($1, $2::text::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [PAUSE_KEY, String(paused), userId],
  );
  cachedPaused = paused;
  cachedAt = Date.now();
}

export function heldStartAfter(): Date {
  return HELD_UNTIL;
}

/**
 * Releases jobs that the pause held, and only those.
 *
 * A job deliberately scheduled for later — a nightly backup, a retry backoff —
 * must keep its schedule, so the release is matched on the marker rather than
 * on "anything with a future start time".
 */
export async function releaseHeldJobs(): Promise<number> {
  const result = await pool.query(
    `UPDATE pgboss.job
        SET start_after = now(),
            data = data - $1
      WHERE state = 'created'
        AND data ? $1`,
    [HELD_MARKER],
  );
  return result.rowCount ?? 0;
}

export async function heldJobCount(): Promise<number> {
  const result = await pool.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM pgboss.job WHERE state = 'created' AND data ? $1",
    [HELD_MARKER],
  );
  return result.rows[0]?.count ?? 0;
}
