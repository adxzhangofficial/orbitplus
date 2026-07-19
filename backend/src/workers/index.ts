import type { Job } from "pg-boss";
import { closePool } from "../database/pool.js";
import {
  getBoss,
  QUEUES,
  stopBoss,
  type AutomationJob,
  type BackupJob,
  type TransferJob,
} from "../queue/index.js";
import { runAutomation, sweepDueAutomations } from "./automation.worker.js";
import { runBackup, runRestore } from "./backup.worker.js";
import { runRetentionSweep, runSessionPrune, runTokenPrune } from "./maintenance.worker.js";
import { runTransfer } from "./transfer.worker.js";
import { runTreeIndex, type TreeIndexJob } from "./tree-index.worker.js";
import { markStaleAgents, pruneOldMetrics, runHealthSweep } from "./health-sweep.worker.js";
import { runAgentInstall, type AgentInstallJob } from "./agent-install.worker.js";

/**
 * pg-boss delivers a batch, and one poisoned job must not fail its neighbours.
 * Each is settled independently and only genuine failures propagate, so the
 * queue's retry policy still applies to them.
 */
function batched<T extends object>(handler: (data: T) => Promise<void>) {
  return async (jobs: Job<T>[]): Promise<void> => {
    const outcomes = await Promise.allSettled(jobs.map((job) => handler(job.data)));
    const failed = outcomes.filter((outcome) => outcome.status === "rejected");
    if (failed.length > 0) {
      const reasons = failed
        .map((outcome) => (outcome as PromiseRejectedResult).reason)
        .map((reason) => (reason instanceof Error ? reason.message : String(reason)))
        .join("; ");
      throw new Error(reasons);
    }
  };
}

export async function startWorkers(): Promise<void> {
  const boss = await getBoss();

  // Transfers and backups touch remote servers, so concurrency is deliberately
  // low: the limit that matters is the remote host's, not this process's.
  await boss.work<TransferJob>(QUEUES.transfer, { batchSize: 5 }, batched(runTransfer));
  await boss.work<BackupJob>(QUEUES.backup, { batchSize: 2 }, batched(runBackup));
  await boss.work<BackupJob & { storageKey: string }>(QUEUES.backupRestore, { batchSize: 2 }, batched(runRestore));
  await boss.work<AutomationJob>(QUEUES.automation, { batchSize: 5 }, batched(runAutomation));
  // One at a time per worker: a tree walk holds a connection and produces a
  // large result, so running several concurrently would spike memory.
  await boss.work<TreeIndexJob>(QUEUES.treeIndex, { batchSize: 1 }, batched(runTreeIndex));

  // Installs run one at a time: each holds an SSH session for tens of seconds.
  await boss.work<AgentInstallJob>(QUEUES.agentInstall, { batchSize: 1 }, batched(runAgentInstall));

  // Every 30 seconds, so latency and status stay current without anyone
  // pressing a button. Skips servers whose breaker is open.
  await boss.work(QUEUES.healthSweep, { batchSize: 1 }, async () => {
    const result = await runHealthSweep();
    const stale = await markStaleAgents();
    if (result.probed || result.failed) console.info("Health sweep complete", { ...result, staleAgents: stale });
  });

  await boss.work(QUEUES.retention, { batchSize: 1 }, async () => {
    const result = await runRetentionSweep();
    console.info("Retention sweep complete", result);
  });

  await boss.work(QUEUES.tokenPrune, { batchSize: 1 }, async () => {
    const metrics = await pruneOldMetrics();
    const tokens = await runTokenPrune();
    const sessions = await runSessionPrune();
    console.info("Credential prune complete", { tokens, sessions, metrics });
  });

  await boss.work(QUEUES.monitorSweep, { batchSize: 1 }, async () => {
    const enqueued = await sweepDueAutomations();
    if (enqueued > 0) console.info("Scheduled automations enqueued", { enqueued });
  });

  // Recurring schedules. pg-boss stores these, so re-registering on every boot
  // updates rather than duplicates them.
  await boss.schedule(QUEUES.monitorSweep, "* * * * *", {});
  await boss.schedule(QUEUES.healthSweep, "* * * * *", {});
  await boss.schedule(QUEUES.retention, "30 3 * * *", {});
  await boss.schedule(QUEUES.tokenPrune, "0 4 * * *", {});

  console.info("Orbit workers started", { queues: Object.values(QUEUES) });
}

export async function stopWorkers(): Promise<void> {
  await stopBoss();
}

// Standalone worker process: `npm run worker -w backend`. Running workers apart
// from the API means a long transfer cannot starve request handling, and the
// two can be scaled independently.
if (process.argv[1]?.includes("workers")) {
  startWorkers().catch((error) => {
    console.error("Workers failed to start", error);
    process.exitCode = 1;
  });

  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}, stopping workers`);
    await stopWorkers().catch(() => undefined);
    await closePool().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
