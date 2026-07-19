import { useEffect, useState } from "react";
import { Circle, TerminalSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { controlClass, PageHeader, Panel } from "./_shared";

/**
 * The shell is not implemented yet.
 *
 * This page previously rendered a working-looking terminal driven by a
 * hardcoded map of command strings: typing `pwd` printed `/var/www/api`, and
 * anything unrecognised printed "Process exited with code 0". Nothing ever
 * reached a server. That is worse than showing nothing, because it invites
 * someone to believe a command ran on their production host.
 *
 * A real implementation needs a WebSocket channel, an SSH shell with PTY
 * allocation and resize handling, terminal emulation on the client, and session
 * recording into the audit trail. Until that exists this page says so plainly
 * and points at the parts that do work.
 */

interface ServerOption { id: string; name: string; host: string; username: string; status: string; }

export function TerminalPage() {
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get<ServerOption[]>("/servers?limit=100")
      .then((rows) => {
        if (!active) return;
        setServers(rows);
        setServerId((current) => current || rows[0]?.id || "");
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const server = servers.find((item) => item.id === serverId);

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Remote access"
      title="Web terminal"
      description="An audited SSH shell in the browser."
      actions={servers.length > 0
        ? <select value={serverId} onChange={(event) => setServerId(event.target.value)} className={controlClass}>
            {servers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        : undefined}
    />

    <div className="grid min-h-[420px] place-items-center rounded-xl border border-white/[0.08] bg-[#08090d] p-8">
      <div className="max-w-md text-center">
        <TerminalSquare className="mx-auto size-8 text-zinc-700" />
        <h2 className="mt-4 text-sm font-medium text-zinc-200">The terminal is not available yet</h2>
        <p className="mt-2 text-[10px] leading-5 text-zinc-500">
          This is the one part of the workspace still being built. It needs a live SSH channel and
          session recording, and until those exist this page will not pretend to run commands.
        </p>
        {server && <p className="mt-4 font-mono text-[9px] text-zinc-600">{server.username}@{server.host}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to={serverId ? `/workspace/servers/${serverId}/files` : "/workspace/servers"} className="rounded-md border border-white/[0.09] px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-white/[0.04]">
            Browse and edit files
          </Link>
          <Link to="/workspace/automations" className="rounded-md border border-white/[0.09] px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-white/[0.04]">
            Run an automation
          </Link>
        </div>
      </div>
    </div>

    <Panel title="What will land here" description="Tracked work, not a promise made by the interface">
      <ul className="space-y-2 text-[10px] leading-5 text-zinc-500">
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />A WebSocket channel authenticated by the same session as the rest of the workspace.</li>
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />A real SSH shell with a PTY, so interactive programs and resizing behave correctly.</li>
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />Full terminal emulation, so colours, cursor control, and editors render properly.</li>
        <li className="flex gap-2"><Circle className="mt-1.5 size-1.5 shrink-0 fill-current" />Every session recorded into the audit trail, with destructive commands gated by approval.</li>
      </ul>
      {!loading && servers.length === 0 && <p className="mt-4 text-[10px] text-zinc-600">Connect a server first and it will appear here.</p>}
    </Panel>
  </div>;
}

export default TerminalPage;
