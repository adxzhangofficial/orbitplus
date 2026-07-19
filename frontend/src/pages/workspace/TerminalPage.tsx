import { FormEvent, useMemo, useRef, useState } from "react";
import { ChevronRight, Circle, Copy, Eraser, History, Maximize2, Play, PlugZap, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { servers, terminalLines } from "@/lib/mock-data";
import { buttonClass, controlClass, PageHeader, Panel, primaryButtonClass, StatusBadge } from "./_shared";

type Line = { type: string; value: string };
const responses: Record<string, string> = {
  pwd: "/var/www/api",
  "whoami": "deploy",
  "git status": "On branch main\nChanges not staged for commit:\n  modified: src/server.ts",
  "ls -la": "drwxr-xr-x  deploy www-data  src\n-rw-r--r--  deploy deploy    package.json\n-rw-------  deploy deploy    .env.production",
  "df -h": "Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1  80G   38G   39G  50% /",
};

export function TerminalPage() {
  const [serverId, setServerId] = useState(servers[0].id);
  const [connected, setConnected] = useState(true);
  const [lines, setLines] = useState<Line[]>(terminalLines);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const server = useMemo(() => servers.find((x) => x.id === serverId) ?? servers[0], [serverId]);

  function execute(event: FormEvent) {
    event.preventDefault(); const value = command.trim(); if (!value || !connected) return;
    const destructive = /(^|\s)(rm\s+-rf|shutdown|reboot|mkfs|drop\s+database)/i.test(value);
    if (destructive) { toast.error("This high-risk command requires an approved runbook"); return; }
    const output = value === "clear" ? "" : responses[value] ?? `Command queued on ${server.name}: ${value}\nProcess exited with code 0`;
    setLines((current) => value === "clear" ? [] : [...current, { type: "prompt", value: `${server.username}@${server.host}:${server.rootPath}$ ${value}` }, { type: "output", value: output }]);
    setHistory((x) => [value, ...x.filter((y) => y !== value)].slice(0, 30)); setCommand(""); setHistoryIndex(-1); window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 0);
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Remote access" title="Web terminal" description="An audited SSH terminal with command controls, session recording, and workspace identity." actions={<><select value={serverId} onChange={(e) => { setServerId(e.target.value); setConnected(false); }} className={controlClass}>{servers.filter((x) => x.status === "online" || x.status === "degraded").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className={connected ? buttonClass : primaryButtonClass} onClick={() => { setConnected(!connected); toast.success(connected ? "Terminal disconnected" : `Connected to ${server.name}`); }}><PlugZap className="size-3.5" />{connected ? "Disconnect" : "Connect"}</button></>} />
    <div className="grid min-h-[620px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#08090d] shadow-2xl shadow-black/30 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="flex min-w-0 flex-col"><header className="flex h-11 items-center justify-between border-b border-white/[0.07] bg-[#101218] px-3"><div className="flex items-center gap-2"><span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-rose-400/70" /><i className="size-2.5 rounded-full bg-amber-400/70" /><i className="size-2.5 rounded-full bg-emerald-400/70" /></span><span className="ml-2 font-mono text-[10px] text-zinc-500">{server.username}@{server.host}</span><StatusBadge status={connected ? "online" : "offline"} /></div><div className="flex"><button className={buttonClass} onClick={() => { navigator.clipboard.writeText(lines.map((x) => x.value).join("\n")); toast.success("Terminal output copied"); }}><Copy className="size-3" />Copy</button><button className={buttonClass} onClick={() => setLines([])}><Eraser className="size-3" />Clear</button><button className="grid size-8 place-items-center text-zinc-500"><Maximize2 className="size-3.5" /></button></div></header><div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-6">{lines.map((line, index) => <pre key={index} className={`whitespace-pre-wrap break-words ${line.type === "prompt" ? "text-emerald-300" : "text-zinc-400"}`}>{line.value}</pre>)}{!connected ? <div className="grid h-full place-items-center text-center"><div><TerminalSquare className="mx-auto size-8 text-zinc-700" /><p className="mt-3 text-xs text-zinc-500">Session disconnected</p><button className={`${primaryButtonClass} mt-4`} onClick={() => setConnected(true)}>Reconnect</button></div></div> : null}</div><form onSubmit={execute} className="flex items-center gap-2 border-t border-white/[0.07] bg-[#0c0e12] p-3"><ChevronRight className="size-4 shrink-0 text-emerald-400" /><input autoFocus disabled={!connected} value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === "ArrowUp" && history.length) { e.preventDefault(); const next = Math.min(history.length - 1, historyIndex + 1); setHistoryIndex(next); setCommand(history[next]); } if (e.key === "ArrowDown") { e.preventDefault(); const next = Math.max(-1, historyIndex - 1); setHistoryIndex(next); setCommand(next === -1 ? "" : history[next]); } }} className="h-9 min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-200 outline-none placeholder:text-zinc-700" placeholder={connected ? "Type a command…" : "Connect to begin"} /><button disabled={!connected || !command.trim()} className={primaryButtonClass}><Play className="size-3" />Run</button></form></section>
      <aside className="border-t border-white/[0.07] bg-[#0d0f14] p-4 lg:border-l lg:border-t-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Session</p><div className="mt-3 space-y-3 text-[10px]"><div><p className="text-zinc-600">Server</p><p className="mt-1 text-zinc-300">{server.name}</p></div><div><p className="text-zinc-600">Working directory</p><p className="mt-1 break-all font-mono text-zinc-300">{server.rootPath}</p></div><div><p className="text-zinc-600">Fingerprint</p><p className="mt-1 break-all font-mono text-zinc-300">{server.fingerprint ?? "Verified on connect"}</p></div><div><p className="text-zinc-600">Recording</p><p className="mt-1 inline-flex items-center gap-1.5 text-emerald-300"><Circle className="size-2 fill-current" />Audit stream active</p></div></div><div className="my-5 border-t border-white/[0.07]" /><div className="flex items-center gap-2"><History className="size-3.5 text-zinc-500" /><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Recent commands</p></div><div className="mt-2 space-y-1">{[...history, "git status", "df -h", "uptime"].slice(0, 6).map((item, index) => <button key={`${item}-${index}`} onClick={() => setCommand(item)} className="block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[10px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300">$ {item}</button>)}</div></aside>
    </div>
  </div>;
}

export default TerminalPage;
