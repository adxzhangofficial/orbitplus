import { withAdapter } from "../adapters/index.js";
import { pool } from "../database/pool.js";
import type { TransferJob } from "../queue/index.js";
import { writeVersioned } from "../services/file.service.js";
import { serverForTenant } from "../services/server.service.js";
import { dispatchEvent } from "../services/integration.service.js";

async function progress(transferId: string, percent: number, bytes?: number): Promise<void> {
  await pool.query(
    `UPDATE transfers SET progress = $2, bytes_transferred = COALESCE($3, bytes_transferred) WHERE id = $1`,
    [transferId, percent, bytes ?? null],
  );
}

/**
 * Executes one transfer.
 *
 * A cancellation between enqueue and pickup is honoured here rather than
 * assumed impossible: the queue has no way to withdraw a job that a worker has
 * already claimed, so the terminal state is re-checked before any bytes move.
 */
export async function runTransfer(job: TransferJob): Promise<void> {
  const claimed = await pool.query<{ id: string }>(
    `UPDATE transfers SET status = 'running', started_at = now(), progress = 5
      WHERE id = $1 AND organization_id = $2 AND status = 'queued'
      RETURNING id`,
    [job.transferId, job.organizationId],
  );
  if (!claimed.rowCount) {
    // Already cancelled, already running, or already finished.
    return;
  }

  try {
    const server = await serverForTenant(job.organizationId, job.serverId);
    await withAdapter(server, async (adapter) => {
      let content: Buffer;
      if (job.direction === "upload") {
        if (job.content === undefined) throw new Error("Upload transfers require content");
        content = Buffer.from(job.content, "base64");
      } else {
        content = await adapter.read(job.sourcePath);
      }
      await progress(job.transferId, 45, 0);

      if (job.direction === "download") {
        // The bytes are already on the server; a download records the transfer
        // and its size without writing anything back.
        await progress(job.transferId, 90, content.length);
      } else {
        await writeVersioned({
          adapter,
          organizationId: job.organizationId,
          serverId: server.id,
          path: job.destinationPath,
          content,
          userId: job.userId,
          note: `Transfer ${job.transferId}`,
        });
        await progress(job.transferId, 90, content.length);
      }

      await pool.query(
        `UPDATE transfers SET status = 'completed', progress = 100, bytes_total = $2,
                bytes_transferred = $2, completed_at = now(), error_message = NULL
          WHERE id = $1`,
        [job.transferId, content.length],
      );
      // Dispatched after the state is committed, so an integration never sees
      // a completion the database has not recorded.
      await dispatchEvent({
        event: 'transfer.completed',
        organizationId: job.organizationId,
        title: 'Transfer completed',
        message: `${job.direction} of ${job.destinationPath} finished on ${server.name}.`,
        severity: 'success',
        resource: { type: 'transfer', id: job.transferId, name: job.destinationPath },
        occurredAt: new Date().toISOString(),
      }).catch(() => undefined);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Transfer failed";
    await pool.query(
      `UPDATE transfers SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1`,
      [job.transferId, message],
    );
    await dispatchEvent({
      event: 'transfer.failed',
      organizationId: job.organizationId,
      title: 'Transfer failed',
      message,
      severity: 'critical',
      resource: { type: 'transfer', id: job.transferId, name: job.destinationPath },
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    // Rethrown so pg-boss records the failure and applies its retry policy.
    throw error;
  }
}
