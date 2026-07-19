import { useMemo, useState } from "react";
import {
  Activity,
  ArchiveRestore,
  ArrowDownToLine,
  ChevronRight,
  CircleCheck,
  CloudUpload,
  Copy,
  Database,
  FileClock,
  FolderTree,
  Gauge,
  Globe2,
  KeyRound,
  MoreHorizontal,
  Network,
  RefreshCw,
  Rocket,
  Server as ServerIcon,
  Settings,
  ShieldCheck,
  Star,
  Terminal,
  Unplug,
  Zap,
} from "lucide-react";
import { Link, NavLink, useParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { Badge, Button, Progress, StatusBadge } from "@/components/ui";
import { activities, backups, deployments, metrics, servers, transfers } from "@/lib/mock-data";
import { cn, formatBytes, relativeTime } from "@/lib/utils";

export function ServerDetailPage() {
  const { serverId = "srv_prod_01" } = useParams();
  const server = servers.find((item) => item.id === serverId) ?? servers[0];
  const [connected, setConnected] = useState(server.status !== "offline");
  const [starred, setStarred] = useState(Boolean(server.starred));
  const tabs = [
    { label: "Overview", to: `/workspace/servers/${server.id}`, end: true },
    { label: "Files", to: `/workspace/servers/${server.id}/files` },
    { label: "Transfers", to: "/workspace/transfers" },
    { label: "Backups", to: "/workspace/backups" },
    { label: "Deployments", to: "/workspace/deployments" },
    { label: "Monitoring", to: "/workspace/monitoring" },
    { label: "Activity", to: "/workspace/activity" },
  ];
  const chartData = useMemo(() => metrics.map((item) => ({ ...item, cpu: Math.max(0, Math.min(100, item.cpu + (server.cpu - 38) / 3)) })), [server.cpu]);
  return (
    <>
      <header className="border-b border-border"><div className="mx-auto max-w-[1500px] px-4 pb-0 pt-5 sm:px-6 md:px-8"><div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground"><ServerIcon className="size-4.5" /></span><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-xl font-semibold">{server.name}</h1><StatusBadge status={connected ? server.status : "offline"} /></div><p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{server.username}@{server.host}:{server.port} · {server.rootPath}</p></div></div><div className="flex flex-wrap gap-2 lg:ml-auto"><Button variant="ghost" size="icon" onClick={() => setStarred((value) => !value)} title="Favorite"><Star className={starred ? "fill-amber-300 text-amber-300" : ""} /></Button><Button variant="outline" onClick={() => void navigator.clipboard.writeText(server.host).then(() => toast.success("Hostname copied"))}><Copy />Copy host</Button><Link to={`/workspace/terminal?server=${server.id}`}><Button variant="outline"><Terminal />Terminal</Button></Link><Button variant={connected ? "danger" : "primary"} onClick={() => { setConnected((value) => !value); toast.success(connected ? "Server disconnected" : "Connection established"); }}>{connected ? <><Unplug />Disconnect</> : <><Zap />Connect</>}</Button><Button variant="ghost" size="icon"><MoreHorizontal /></Button></div></div><nav className="flex min-w-0 gap-1 overflow-x-auto" aria-label="Server sections">{tabs.map((tab) => <NavLink key={tab.label} to={tab.to} end={tab.end} className={({ isActive }) => cn("relative flex h-9 shrink-0 items-center px-3 text-[10px] text-muted-foreground hover:text-foreground", isActive && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-white")}>{tab.label}</NavLink>)}</nav></div></header>
      <div className="mx-auto max-w-[1500px] space-y-8 px-4 py-5 sm:px-6 md:px-8 md:py-7">
        <section className="grid grid-cols-2 border-y border-border lg:grid-cols-6">{[
          { label: "CPU", value: `${connected ? server.cpu : 0}%`, icon: Activity, detail: "4 vCPU" },
          { label: "Memory", value: `${connected ? server.memory : 0}%`, icon: Gauge, detail: "5.1 / 8 GB" },
          { label: "Disk", value: `${server.disk}%`, icon: Database, detail: "94 / 200 GB" },
          { label: "Latency", value: connected ? `${server.latency} ms` : "—", icon: Zap, detail: server.region.split(" · ")[0] },
          { label: "Uptime", value: connected ? server.uptime : "—", icon: CircleCheck, detail: "last 30 days" },
          { label: "Transfers", value: "1", icon: CloudUpload, detail: "18.4 MB/s" },
        ].map((item, index) => <div key={item.label} className={cn("flex items-center gap-3 p-3.5", index % 2 === 0 && "border-r", index < 4 && "border-b lg:border-b-0", index < 5 && "lg:border-r")}><span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><item.icon className="size-3.5" /></span><span className="min-w-0"><strong className="block text-lg tabular-nums">{item.value}</strong><span className="block truncate text-[8px] text-muted-foreground">{item.label} · {item.detail}</span></span></div>)}</section>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]"><div><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold">Resource load</h2><p className="mt-1 text-[10px] text-muted-foreground">CPU, memory, and network · last 24 hours</p></div><div className="flex items-center gap-3 text-[8px] text-zinc-600"><span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-blue-400" />CPU</span><span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-violet-400" />Memory</span></div></div><div className="h-72 rounded-lg border border-border bg-card p-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="serverCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6b82ff" stopOpacity={0.22} /><stop offset="1" stopColor="#6b82ff" stopOpacity={0} /></linearGradient><linearGradient id="serverMem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" stopOpacity={0.16} /><stop offset="1" stopColor="#a78bfa" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="time" tick={{ fill: "#52525b", fontSize: 8 }} axisLine={false} tickLine={false} interval={3} /><Tooltip contentStyle={{ background: "#171717", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 9 }} /><Area type="monotone" dataKey="memory" stroke="#a78bfa" strokeWidth={1.2} fill="url(#serverMem)" /><Area type="monotone" dataKey="cpu" stroke="#6b82ff" strokeWidth={1.5} fill="url(#serverCpu)" /></AreaChart></ResponsiveContainer></div></div>
          <aside><div className="mb-3"><h2 className="text-sm font-semibold">Connection details</h2><p className="mt-1 text-[10px] text-muted-foreground">Identity, trust, and network scope</p></div><div className="rounded-lg border border-border bg-card"><div className="divide-y divide-border">{[
            { icon: Globe2, label: "Region", value: server.region }, { icon: ServerIcon, label: "Provider", value: server.provider }, { icon: KeyRound, label: "Identity", value: `${server.username} · SSH key` }, { icon: FingerprintIcon, label: "Host key", value: server.fingerprint ?? "Not pinned" }, { icon: Network, label: "Allowed root", value: server.rootPath },
          ].map((item) => <div key={item.label} className="flex items-center gap-3 px-4 py-3"><item.icon className="size-3.5 text-zinc-600" /><span className="w-16 shrink-0 text-[8px] text-muted-foreground">{item.label}</span><span className="min-w-0 flex-1 truncate text-right font-mono text-[8px] text-zinc-300">{item.value}</span></div>)}</div><div className="flex items-center gap-2 border-t border-border bg-emerald-400/[0.03] px-4 py-3 text-[8px] text-emerald-300"><ShieldCheck className="size-3.5" />Fingerprint verified · credential encrypted</div></div></aside>
        </section>

        <section className="grid gap-8 xl:grid-cols-3"><div><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold">Recent files</h2><p className="mt-1 text-[10px] text-muted-foreground">Latest remote changes</p></div><Link to={`/workspace/servers/${server.id}/files`} className="text-[9px] text-muted-foreground hover:text-foreground">Open explorer</Link></div><div className="divide-y divide-border border-y border-border">{["server.ts", "docker-compose.yml", ".env.production", "package.json"].map((file, index) => <Link key={file} to={`/workspace/servers/${server.id}/files?file=${encodeURIComponent(file)}`} className="flex items-center gap-3 py-3"><span className="grid size-7 place-items-center rounded-md bg-muted text-muted-foreground"><FolderTree className="size-3" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-medium">{file}</strong><span className="mt-0.5 block text-[8px] text-muted-foreground">deploy · {index * 12 + 6}m ago</span></span>{index < 2 && <Badge tone="info">modified</Badge>}</Link>)}</div></div>
          <div><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold">Recovery points</h2><p className="mt-1 text-[10px] text-muted-foreground">Recent encrypted backups</p></div><Link to="/workspace/backups" className="text-[9px] text-muted-foreground hover:text-foreground">Manage</Link></div><div className="divide-y divide-border border-y border-border">{backups.filter((item) => item.server === server.name).slice(0, 4).map((backup) => <div key={backup.id} className="flex items-center gap-3 py-3"><span className="grid size-7 place-items-center rounded-md bg-muted text-violet-300"><ArchiveRestore className="size-3" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-medium">{backup.name}</strong><span className="mt-0.5 block text-[8px] text-muted-foreground">{formatBytes(backup.size)} · {relativeTime(backup.createdAt)}</span></span><StatusBadge status={backup.status} /></div>)}</div></div>
          <div><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold">Deployments</h2><p className="mt-1 text-[10px] text-muted-foreground">Latest production releases</p></div><Link to="/workspace/deployments" className="text-[9px] text-muted-foreground hover:text-foreground">View all</Link></div><div className="divide-y divide-border border-y border-border">{deployments.slice(0, 4).map((deployment) => <div key={deployment.id} className="flex items-center gap-3 py-3"><span className="grid size-7 place-items-center rounded-md bg-muted text-blue-300"><Rocket className="size-3" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-medium">{deployment.project} · {deployment.commit}</strong><span className="mt-0.5 block text-[8px] text-muted-foreground">{deployment.author} · {relativeTime(deployment.createdAt)}</span></span><StatusBadge status={deployment.status} /></div>)}</div></div></section>

        <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold">Server activity</h2><p className="mt-1 text-[10px] text-muted-foreground">Recent audited events on this connection</p></div><Link to="/workspace/activity" className="text-[9px] text-muted-foreground hover:text-foreground">Full audit</Link></div><div className="overflow-x-auto border-y border-border"><table className="w-full min-w-[720px] text-left text-[9px]"><thead className="border-b border-border text-[8px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Actor</th><th>Action</th><th>Resource</th><th>IP</th><th className="px-3 text-right">When</th></tr></thead><tbody className="divide-y divide-border">{activities.filter((item) => !item.server || item.server === server.name).slice(0, 5).map((event) => <tr key={event.id}><td className="px-3 py-3 font-medium">{event.actor}</td><td className="text-muted-foreground">{event.action}</td><td>{event.resource}</td><td className="font-mono text-muted-foreground">{event.ip ?? "system"}</td><td className="px-3 text-right text-muted-foreground">{relativeTime(event.createdAt)}</td></tr>)}</tbody></table></div></section>
      </div>
    </>
  );
}

function FingerprintIcon({ className }: { className?: string }) { return <ShieldCheck className={className} />; }

export default ServerDetailPage;
