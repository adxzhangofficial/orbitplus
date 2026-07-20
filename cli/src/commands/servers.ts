import { ApiError } from "../client.js";
import { required, type Command } from "../command.js";
import { detail, json, print, relative, statusStyle, style, table } from "../output.js";
import { resolveServer } from "../resolve.js";

/** Mirrors publicServerColumns in the API. */
export interface Server {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  description: string;
  host: string;
  port: number;
  username: string;
  rootPath: string;
  environment: string;
  adapterMode: string;
  authenticationType: string;
  hostFingerprint: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  createdAt: string;
}

export const serversList: Command = {
  name: "servers ls",
  summary: "List the servers in this workspace",
  usage: "orbit servers ls [--environment <env>] [--status <status>]",
  async run({ flags, client }) {
    const { data } = await client.get<Server[]>("/servers", {
      environment: flags.values.environment,
      status: flags.values.status,
      limit: 200,
    });

    if (flags.json) { json(data); return; }
    if (data.length === 0) { print(style.dim("No servers are connected.")); return; }

    print(table(data, [
      { header: "ID", value: (row) => style.dim(row.id.slice(0, 8)) },
      { header: "NAME", value: (row) => row.name },
      { header: "HOST", value: (row) => `${row.username}@${row.host}:${row.port}` },
      { header: "ENV", value: (row) => row.environment },
      { header: "STATUS", value: (row) => statusStyle(row.status)(row.status) },
      // Null means never measured, which is not the same as measured at zero.
      { header: "LATENCY", value: (row) => (row.lastLatencyMs === null ? style.dim("—") : `${row.lastLatencyMs} ms`), align: "right" },
      { header: "CHECKED", value: (row) => style.dim(relative(row.lastCheckedAt)) },
    ]));
  },
};

export const serversShow: Command = {
  name: "servers show",
  summary: "Show one server in full",
  usage: "orbit servers show <server-id>",
  async run({ flags, client }) {
    const data = await resolveServer(client, required(flags, 0, "server-id"));

    if (flags.json) { json(data); return; }
    print(detail([
      ["Name", data.name],
      ["ID", data.id],
      ["Workspace", data.workspaceName],
      ["Address", `${data.username}@${data.host}:${data.port}`],
      ["Auth", data.authenticationType],
      ["Mode", data.adapterMode],
      ["Environment", data.environment],
      ["Root path", data.rootPath],
      ["Fingerprint", data.hostFingerprint ?? style.dim("not pinned")],
      ["Status", statusStyle(data.status)(data.status)],
      ["Latency", data.lastLatencyMs === null ? style.dim("not measured") : `${data.lastLatencyMs} ms`],
      ["Last checked", relative(data.lastCheckedAt)],
      ["Connected", relative(data.createdAt)],
    ]));
  },
};

export const serversTest: Command = {
  name: "servers test",
  summary: "Open a connection and report what happened",
  usage: "orbit servers test <server-id>",
  async run({ flags, client }) {
    const id = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    try {
      // A handshake against an unreachable host takes longer than a normal
      // read, and cutting it off early would report a timeout that is the
      // CLI's own rather than the server's.
      const { data } = await client.post<{ ok: boolean; latencyMs: number; message: string }>(
        `/servers/${encodeURIComponent(id)}/test`,
        {},
        { timeoutMs: 60_000 },
      );
      if (flags.json) { json(data); return data.ok ? 0 : 1; }
      print(`${style.green("✓")} ${data.message} (${data.latencyMs} ms)`);
      return 0;
    } catch (error) {
      // The API raises rather than returning ok:false, so a refused connection
      // arrives here. It is a result, not a crash, and reads as one.
      if (!(error instanceof ApiError) || error.status === 0 || error.status === 401 || error.status === 403) throw error;
      if (flags.json) { json({ ok: false, message: error.message }); return 1; }
      print(`${style.red("×")} ${error.message}`);
      return 1;
    }
  },
};
