import { useState } from "react";
import { Activity, BellRing, Check, Cpu, Gauge, HardDrive, MemoryStick, Network, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, EmptyState, PageHeader, Panel, ProgressBar, Segmented, Stat, StatusBadge } from "./_shared";

type MonitorServer = { id: string; name: string; status: string; cpu: number | null; memory: number | null; disk: number | null; latency: number | null; metricsSource?: string; metricsSampledAt?: string; sampledAt?: string; services?: unknown[] };
type MonitorAlert = { id: string; title: string; server: string; metric: string; severity: string; createdAt: string; state: string };
type MonitoringData = { servers: MonitorServer[]; alerts: MonitorAlert[] };
type BackendMonitoring = { servers: Array<{ serverId: string; serverName: string; connectionStatus: string; status?: string; cpuPercent?: number | string | null; memoryPercent?: number | string | null; diskPercent?: number | string | null; latencyMs?: number | string | null; metricsSource?: string; metricsSampledAt?: string; services?: unknown[]; sampledAt?: string }>; alerts: Array<{ id: string; serverId?: string; serverName?: string; severity: string; title: string; message: string; status: string; createdAt: string }> };


function toMonitoring(input: BackendMonitoring): MonitoringData {
  return {
    servers: input.servers.map((server) => ({ id: server.serverId, name: server.serverName, status: server.status ?? server.connectionStatus, cpu: server.cpuPercent == null ? null : Number(server.cpuPercent), memory: server.memoryPercent == null ? null : Number(server.memoryPercent), disk: server.diskPercent == null ? null : Number(server.diskPercent), latency: server.latencyMs == null ? null : Number(server.latencyMs), metricsSource: server.metricsSource, metricsSampledAt: server.metricsSampledAt, sampledAt: server.sampledAt, services: server.services })),
    alerts: input.alerts.map((alert) => ({ id: alert.id, title: alert.title, server: alert.serverName ?? "Workspace", metric: alert.message, severity: alert.severity, createdAt: alert.createdAt, state: alert.status })),
  };
}

export function MonitoringPage() {
  const resource = useLiveResource({ servers: [], alerts: [] } as MonitoringData, async () => toMonitoring(await api.get<BackendMonitoring>("/monitoring")));
  const { data, setData, live } = resource;
  const [serverId, setServerId] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const selected = data.servers.find((server) => server.id === serverId) ?? data.servers[0];
  const online = data.servers.filter((server) => ["online", "healthy"].includes(server.status)).length;
  const chartData = selected && selected.cpu !== null ? [{ time: selected.metricsSampledAt ? new Date(selected.metricsSampledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Latest", cpu: selected.cpu, memory: selected.memory ?? 0, network: Math.min(100, selected.latency ?? 0) }] : [];

  async function probe() {
    if (!selected) { toast.error("No server is available to probe"); return; }
    if (!live) { toast.success("Preview telemetry refreshed"); return; }
    try { await api.post(`/monitoring/probe/${selected.id}`); await resource.refresh(); toast.success(`${selected.name} probe completed`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to probe server"); }
  }

  async function updateAlert(alert: MonitorAlert, status: "acknowledged" | "resolved") {
    if (live) {
      try { await api.patch(`/monitoring/alerts/${alert.id}`, { status }); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update alert"); return; }
    }
    setData((current) => ({ ...current, alerts: current.alerts.map((row) => row.id === alert.id ? { ...row, state: status } : row) }));
    toast.success(status === "resolved" ? "Alert resolved" : "Alert acknowledged");
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Observability" title="Monitoring" description="Real-time health, resource telemetry, and actionable alerts for every connected server." actions={<><select value={selected?.id ?? ""} onChange={(event) => setServerId(event.target.value)} className={controlClass}>{data.servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select><button className={buttonClass} onClick={() => void probe()}><RefreshCw className="size-3.5" />Probe now</button></>} />
    <WorkspaceDataStatus live={live} loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh().catch(() => undefined)} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Fleet availability" value={`${online}/${data.servers.length}`} detail="Latest connection state" icon={Server} tone="emerald" /><Stat label="Open alerts" value={data.alerts.filter((alert) => alert.state === "open").length} detail={`${data.alerts.filter((alert) => alert.severity === "critical" && alert.state === "open").length} critical`} icon={BellRing} tone="rose" /><Stat label="Selected latency" value={`${selected?.latency ?? 0}ms`} detail="Latest probe" icon={Gauge} tone="sky" /><Stat label="Telemetry samples" value={data.servers.filter((server) => server.sampledAt).length} detail={live ? "Latest samples available" : "Preview history"} icon={Activity} tone="indigo" /></div>
    {selected ? <Panel title={`${selected.name} telemetry`} description={live ? selected.sampledAt ? `Latest sample · ${relativeTime(selected.sampledAt)}` : "No probe sample recorded yet" : "Preview resource history"} actions={live ? undefined : <Segmented value={range} onChange={setRange} options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }]} />}><div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{selected.cpu === null && <div className="mb-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[10px] leading-5 text-amber-200/90">SFTP can measure reachability and latency, but it cannot read CPU, memory, or disk. Install the read-only agent on this server to collect those. Until then these stay empty rather than showing zero.</div>}{[{ label: "CPU", value: selected.cpu, icon: Cpu, color: "text-indigo-300" }, { label: "Memory", value: selected.memory, icon: MemoryStick, color: "text-sky-300" }, { label: "Disk", value: selected.disk, icon: HardDrive, color: "text-amber-300" }, { label: "Latency", value: selected.latency === null ? null : Math.min(100, selected.latency), icon: Network, color: "text-emerald-300", suffix: selected.latency === null ? "no data" : `${selected.latency}ms` }].map((metric) => <div key={metric.label} className="rounded-lg border border-white/[0.06] bg-black/10 p-3"><div className="mb-2 flex items-center justify-between text-[10px]"><span className="inline-flex items-center gap-1.5 text-zinc-500"><metric.icon className={`size-3.5 ${metric.color}`} />{metric.label}</span><span className={metric.value === null ? "font-mono text-zinc-600" : "font-mono text-zinc-300"}>{metric.value === null ? "no data" : (metric.suffix ?? `${metric.value}%`)}</span></div><ProgressBar value={metric.value ?? 0} tone={(metric.value ?? 0) > 75 ? "rose" : (metric.value ?? 0) > 60 ? "amber" : "indigo"} /></div>)}</div><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}><defs><linearGradient id="monitorCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#818cf8" stopOpacity={0.3} /><stop offset="1" stopColor="#818cf8" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="time" stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} /><YAxis stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} /><Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 11 }} /><Area isAnimationActive={false} dot={live} type="monotone" dataKey="cpu" stroke="#818cf8" fill="url(#monitorCpu)" strokeWidth={2} /><Area isAnimationActive={false} dot={live} type="monotone" dataKey="memory" stroke="#38bdf8" fill="transparent" strokeWidth={1.5} /><Area isAnimationActive={false} dot={live} type="monotone" dataKey="network" stroke="#34d399" fill="transparent" strokeWidth={1.5} /></AreaChart></ResponsiveContainer></div><div className="mt-2 flex flex-wrap gap-4 text-[10px] text-zinc-500"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-indigo-400" />CPU</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-sky-400" />Memory</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-400" />Latency index</span></div></Panel> : <EmptyState icon={Server} title="No monitoring targets" description="Connect a server to begin collecting health samples." />}
    <Panel title="Active alerts" description="Alert states are synchronized with the workspace API" actions={<button className={buttonClass} onClick={() => toast.info("Alert policy editing is not exposed by the API yet.")}><ShieldAlert className="size-3.5" />Manage policies</button>} flush>{data.alerts.length ? <div className="divide-y divide-white/[0.06]">{data.alerts.map((alert) => <div key={alert.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_110px_auto] md:items-center"><div><div className="flex items-center gap-2"><p className="text-sm font-medium text-zinc-200">{alert.title}</p><StatusBadge status={alert.severity} /></div><p className="mt-1 text-[10px] text-zinc-500">{alert.metric} · {relativeTime(alert.createdAt)}</p></div><span className="text-xs text-zinc-400">{alert.server}</span><StatusBadge status={alert.state} /><div className="flex justify-end gap-2">{alert.state === "open" ? <><button className={buttonClass} onClick={() => void updateAlert(alert, "acknowledged")}>Acknowledge</button><button className={buttonClass} onClick={() => void updateAlert(alert, "resolved")}><Check className="size-3" />Resolve</button></> : alert.state === "acknowledged" ? <button className={buttonClass} onClick={() => void updateAlert(alert, "resolved")}><Check className="size-3" />Resolve</button> : null}</div></div>)}</div> : <EmptyState icon={Check} title="No alerts" description="There are no current or historical alerts for this workspace." />}</Panel>
  </div>;
}

export default MonitoringPage;
