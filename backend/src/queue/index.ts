import { PgBoss } from "pg-boss";
import { env } from "../config/env.js";

/**
 * Durable job queue backed by the application's own PostgreSQL instance.
 *
 * Using Postgres rather than Redis is deliberate at this scale: jobs are
 * already transactional with the rows they operate on, there is one fewer
 * service to run and back up, and the throughput ceiling is far above what a
 * few thousand users generate.
 */

export const QUEUES = {
  transfer: "transfer.execute",
  backup: "backup.run",
  backupRestore: "backup.restore",
  automation: "automation.run",
  retention: "maintenance.retention",
  tokenPrune: "maintenance.prune-tokens",
  monitorSweep: "maintenance.monitor-sweep",
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

export interface TransferJob {
  transferId: string;
  organizationId: string;
  serverId: string;
  userId: string;
  direction: "upload" | "download" | "sync";
  sourcePath: string;
  destinationPath: string;
  /** Base64 payload for uploads; downloads and syncs read from the server. */
  content?: string;
}

export interface BackupJob {
  backupId: string;
  organizationId: string;
  serverId: string;
  userId: string;
  rootPath: string;
}

export interface AutomationJob {
  automationId: string;
  organizationId: string;
  triggeredBy: "schedule" | "manual" | "webhook" | "event";
  userId?: string;
}

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  // Concurrent callers during startup must share one instance, otherwise each
  // would run pg-boss's schema installation against the same database.
  starting ??= (async () => {
    const instance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
    });
    instance.on("error", (error: unknown) => console.error("Job queue error", error));
    await instance.start();
    for (const queue of Object.values(QUEUES)) {
      // Retry policy is per queue in pg-boss v12. Jobs retry with backoff
      // rather than being dropped, so a transfer that failed because a server
      // was briefly unreachable recovers without anyone intervening.
      await instance.createQueue(queue, {
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        // A job stuck active longer than this is presumed dead and retried.
        expireInSeconds: 900,
        // Finished jobs stay long enough for the UI to show recent outcomes.
        deleteAfterSeconds: 7 * 86_400,
      });
    }
    boss = instance;
    return instance;
  })();
  return starting;
}

export async function enqueue<T extends object>(
  queue: QueueName,
  data: T,
  options: { singletonKey?: string; startAfter?: Date } = {},
): Promise<string | null> {
  const instance = await getBoss();
  return instance.send(queue, data, {
    ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
    ...(options.startAfter ? { startAfter: options.startAfter } : {}),
  });
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, close: true });
  boss = undefined;
  starting = undefined;
}
