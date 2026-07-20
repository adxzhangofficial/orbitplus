import { confirm, required, type Command } from "../command.js";
import { bytes, detail, info, json, print, relative, statusStyle, style, table } from "../output.js";
import { defaultPath, resolveServer } from "../resolve.js";

interface Backup {
  id: string;
  serverId: string;
  serverName?: string;
  name: string;
  path: string;
  type: string;
  status: string;
  sizeBytes: string | number;
  fileCount: number;
  retentionUntil: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastRestoredAt: string | null;
}

const TERMINAL = new Set(["completed", "failed"]);

export const backupsList: Command = {
  name: "backups ls",
  summary: "List backups",
  usage: "orbit backups ls",
  async run({ flags, client }) {
    const { data } = await client.get<Backup[]>("/backups", { limit: 100 });
    if (flags.json) { json(data); return; }
    if (data.length === 0) { print(style.dim("No backups yet.")); return; }

    print(table(data, [
      { header: "ID", value: (row) => style.dim(row.id.slice(0, 8)) },
      { header: "NAME", value: (row) => row.name },
      { header: "SERVER", value: (row) => row.serverName ?? style.dim("—") },
      { header: "STATUS", value: (row) => statusStyle(row.status)(row.status) },
      { header: "SIZE", value: (row) => bytes(row.sizeBytes), align: "right" },
      { header: "FILES", value: (row) => String(row.fileCount), align: "right" },
      { header: "CREATED", value: (row) => style.dim(relative(row.createdAt)) },
    ]));
  },
};

export const backupsShow: Command = {
  name: "backups show",
  summary: "Show one backup",
  usage: "orbit backups show <backup-id>",
  async run({ flags, client }) {
    const id = required(flags, 0, "backup-id");
    const { data } = await client.get<Backup>(`/backups/${encodeURIComponent(id)}`);
    if (flags.json) { json(data); return; }
    print(detail([
      ["Name", data.name],
      ["ID", data.id],
      ["Server", data.serverName ?? data.serverId],
      ["Path", data.path],
      ["Type", data.type],
      ["Status", statusStyle(data.status)(data.status)],
      ["Size", bytes(data.sizeBytes)],
      ["Files", String(data.fileCount)],
      ["Created", relative(data.createdAt)],
      ["Started", relative(data.startedAt)],
      ["Completed", relative(data.completedAt)],
      ["Last restored", relative(data.lastRestoredAt)],
      ["Expires", data.retentionUntil ? relative(data.retentionUntil) : style.dim("never")],
      ...(data.errorMessage ? [["Error", style.red(data.errorMessage)] as [string, string]] : []),
    ]));
    return data.status === "failed" ? 1 : 0;
  },
};

/**
 * Polls until a backup settles.
 *
 * Backups run on the queue, so the create call returns immediately. Without
 * --wait a script would have no way to know whether the snapshot it just asked
 * for actually succeeded before it moves on.
 */
async function waitFor(
  client: { get: <T>(path: string) => Promise<{ data: T }> },
  id: string,
  timeoutMs: number,
  quiet: boolean,
): Promise<Backup> {
  const deadline = Date.now() + timeoutMs;
  let delay = 1_000;
  let last = "";

  for (;;) {
    const { data } = await client.get<Backup>(`/backups/${encodeURIComponent(id)}`);
    if (TERMINAL.has(data.status)) return data;
    if (!quiet && data.status !== last) {
      info(style.dim(`  ${data.status}…`));
      last = data.status;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Backup ${id} was still ${data.status} after ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    // Backing off keeps a long backup from generating hundreds of requests.
    delay = Math.min(delay * 1.5, 10_000);
  }
}

export const backupsCreate: Command = {
  name: "backups create",
  summary: "Queue a backup",
  usage: "orbit backups create <server-id> --name <name> [--path /] [--retention-days 30] [--wait]",
  async run({ flags, client }) {
    const server = await resolveServer(client, required(flags, 0, "server-id"));
    const name = flags.values.name ?? `CLI backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

    const { data } = await client.post<Backup>("/backups", {
      serverId: server.id,
      name,
      // The connection is scoped to its root, so that is the whole-server
      // default rather than "/".
      path: defaultPath(server, flags.values.path),
      retentionDays: Number(flags.values["retention-days"] ?? 30),
    });

    if (flags.values.wait !== "true") {
      if (flags.json) { json(data); return; }
      print(`${style.green("✓")} Queued ${style.bold(name)} (${data.id})`);
      info(style.dim("Runs on the queue. Add --wait, or poll with `orbit backups show`."));
      return;
    }

    if (!flags.json) info(`Waiting for ${name}…`);
    const finished = await waitFor(client, data.id, Number(flags.values.timeout ?? 900) * 1_000, flags.json);

    if (flags.json) { json(finished); return finished.status === "completed" ? 0 : 1; }
    if (finished.status === "completed") {
      print(`${style.green("✓")} ${name}: ${finished.fileCount} files, ${bytes(finished.sizeBytes)}`);
      return 0;
    }
    print(`${style.red("×")} ${name} failed: ${finished.errorMessage ?? "no reason recorded"}`);
    return 1;
  },
};

export const backupsRestore: Command = {
  name: "backups restore",
  summary: "Restore a backup onto its server",
  usage: "orbit backups restore <backup-id> [--yes] [--wait]",
  async run({ flags, client }) {
    const id = required(flags, 0, "backup-id");
    const { data: backup } = await client.get<Backup>(`/backups/${encodeURIComponent(id)}`);

    // A restore overwrites live files, so the prompt names what it will touch
    // rather than asking a generic "are you sure".
    const question = `Restore ${backup.fileCount} files from "${backup.name}" onto ${backup.serverName ?? backup.serverId}, overwriting what is there?`;
    if (!(await confirm(flags, question))) { info("Cancelled."); return 1; }

    await client.post(`/backups/${encodeURIComponent(id)}/restore`);

    if (flags.values.wait !== "true") {
      if (flags.json) { json({ backupId: id, status: "restoring" }); return; }
      print(`${style.green("✓")} Restore queued for ${backup.name}`);
      return;
    }

    if (!flags.json) info("Waiting for the restore…");
    const finished = await waitFor(client, id, Number(flags.values.timeout ?? 900) * 1_000, flags.json);
    const restored = Boolean(finished.lastRestoredAt) && !finished.errorMessage;

    if (flags.json) { json(finished); return restored ? 0 : 1; }
    if (restored) { print(`${style.green("✓")} Restored ${backup.name}`); return 0; }
    print(`${style.red("×")} Restore failed: ${finished.errorMessage ?? "no reason recorded"}`);
    return 1;
  },
};
