import type { Command } from "../command.js";
import { json, print, relative, statusStyle, style, table, truncate } from "../output.js";

interface Transfer {
  id: string;
  serverId: string;
  serverName?: string;
  direction: string;
  status: string;
  path: string;
  sizeBytes: string | number;
  createdAt: string;
}

interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actor?: string;
  ipAddress?: string;
  createdAt: string;
}

export const transfersList: Command = {
  name: "transfers ls",
  summary: "List recent transfers",
  usage: "orbit transfers ls [--status <status>]",
  async run({ flags, client }) {
    const { data } = await client.get<Transfer[]>("/transfers", {
      status: flags.values.status,
      limit: 50,
    });
    if (flags.json) { json(data); return; }
    if (data.length === 0) { print(style.dim("No transfers recorded.")); return; }

    print(table(data, [
      { header: "ID", value: (row) => style.dim(row.id.slice(0, 8)) },
      { header: "DIR", value: (row) => row.direction },
      { header: "STATUS", value: (row) => statusStyle(row.status)(row.status) },
      { header: "PATH", value: (row) => truncate(row.path, 44) },
      { header: "WHEN", value: (row) => style.dim(relative(row.createdAt)) },
    ]));
  },
};

export const activityList: Command = {
  name: "activity ls",
  summary: "List the workspace audit trail",
  usage: "orbit activity ls [--action <action>] [--limit 50]",
  async run({ flags, client }) {
    const { data } = await client.get<AuditEvent[]>("/activity", {
      action: flags.values.action,
      limit: Number(flags.values.limit ?? 50),
    });
    if (flags.json) { json(data); return; }
    if (data.length === 0) { print(style.dim("No activity recorded.")); return; }

    print(table(data, [
      { header: "WHEN", value: (row) => style.dim(relative(row.createdAt)) },
      { header: "ACTOR", value: (row) => truncate(row.actor ?? "—", 24) },
      { header: "ACTION", value: (row) => row.action },
      { header: "RESOURCE", value: (row) => `${row.resourceType}${row.resourceId ? ` ${row.resourceId.slice(0, 8)}` : ""}` },
      { header: "IP", value: (row) => style.dim(row.ipAddress ?? "—") },
    ]));
  },
};

interface Overview {
  counts: { servers: number; transfers?: number; backups?: number };
  servers?: { online: number; offline: number; degraded: number; unknown: number };
  alerts?: { open: number; critical: number };
}

export const status: Command = {
  name: "status",
  summary: "Summarise the workspace",
  usage: "orbit status",
  async run({ flags, client }) {
    const { data } = await client.get<Overview>("/overview");
    if (flags.json) { json(data); return; }

    const servers = data.servers;
    print(style.bold("Servers"));
    if (servers) {
      print(`  ${style.green(String(servers.online))} online   ${style.red(String(servers.offline))} offline   ${style.yellow(String(servers.degraded))} degraded   ${style.dim(`${servers.unknown} unknown`)}`);
    } else {
      print(`  ${data.counts.servers} connected`);
    }

    if (data.alerts) {
      print(style.bold("\nAlerts"));
      const colour = data.alerts.critical > 0 ? style.red : data.alerts.open > 0 ? style.yellow : style.green;
      print(`  ${colour(`${data.alerts.open} open`)}${data.alerts.critical ? style.red(`, ${data.alerts.critical} critical`) : ""}`);
    }

    // Non-zero when something needs attention, so this can gate a deploy step.
    return data.alerts?.critical ? 1 : 0;
  },
};
