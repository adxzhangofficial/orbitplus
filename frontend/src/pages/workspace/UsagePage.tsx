import { useMemo, useState } from "react";
import { Activity, Download, Gauge, HardDrive, Server, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { formatBytes } from "@/lib/utils";
import { buttonClass, PageHeader, Panel, ProgressBar, Segmented, Stat } from "./_shared";

type BillingUsage = { members: number; workspaces: number; servers: number; backupBytes: number | string; transferBytes: number | string };
type UsageData = { subscription?: { plan: "free" | "pro" | "enterprise" }; usage: BillingUsage };
type Resource = { label: string; used: number; limit?: number; unit?: string; detail: string; icon: typeof Server; tone: "indigo" | "sky" | "emerald" | "amber" };
const previewData: UsageData = { subscription: { plan: "pro" }, usage: { members: 5, workspaces: 2, servers: 5, backupBytes: 12_500_000_000, transferBytes: 284_000_000_000 } };
const emptyData: UsageData = { usage: { members: 0, workspaces: 0, servers: 0, backupBytes: 0, transferBytes: 0 } };
const daily = Array.from({ length: 30 }, (_, index) => ({ day: `${index + 1}`, bandwidth: 9 + (index * 17) % 32, operations: 1200 + (index * 823) % 5100 }));

export function UsagePage() {
  const resource = useLiveResource(previewData, emptyData, () => api.get<UsageData>("/billing"));
  const { data, live } = resource;
  const [range, setRange] = useState<"30d" | "90d" | "12m">("30d");
  const factor = range === "30d" ? 1 : range === "90d" ? 1.6 : 2.4;
  const plan = data.subscription?.plan ?? "free";
  const resources = useMemo<Resource[]>(() => {
    if (!live) return [
      { label: "Servers", used: 5, limit: 10, detail: "5 available", icon: Server, tone: "indigo" },
      { label: "Team seats", used: 5, limit: 15, detail: "10 available", icon: Users, tone: "sky" },
      { label: "Backup storage", used: 12.5, limit: 50, unit: " GB", detail: "37.5 GB available", icon: HardDrive, tone: "emerald" },
      { label: "Monthly transfer", used: 284, limit: 500, unit: " GB", detail: "216 GB available", icon: Activity, tone: "amber" },
    ];
    const serverLimit = plan === "free" ? 2 : plan === "pro" ? 50 : undefined;
    const memberLimit = plan === "free" ? 1 : plan === "pro" ? 10 : undefined;
    return [
      { label: "Servers", used: Number(data.usage.servers), limit: serverLimit, detail: serverLimit ? `${Math.max(0, serverLimit - Number(data.usage.servers))} available` : "Enterprise allocation", icon: Server, tone: "indigo" },
      { label: "Team seats", used: Number(data.usage.members), limit: memberLimit, detail: memberLimit ? `${Math.max(0, memberLimit - Number(data.usage.members))} available` : "Enterprise allocation", icon: Users, tone: "sky" },
      { label: "Backup storage", used: Number(data.usage.backupBytes), detail: `${formatBytes(Number(data.usage.backupBytes))} stored`, icon: HardDrive, tone: "emerald" },
      { label: "Monthly transfer", used: Number(data.usage.transferBytes), detail: `${formatBytes(Number(data.usage.transferBytes))} this month`, icon: Activity, tone: "amber" },
    ];
  }, [data, live, plan]);

  function exportCsv() {
    const rows = [["resource", "used", "limit", "detail"], ...resources.map((item) => [item.label, String(item.used), item.limit === undefined ? "metered" : String(item.limit), item.detail])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "orbit-usage.csv"; anchor.click(); URL.revokeObjectURL(url); toast.success("Usage report exported");
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Plan & consumption" title="Usage" description="Track workspace consumption, quotas, and activity before limits affect your operations." actions={<button className={buttonClass} onClick={exportCsv}><Download className="size-3.5" />Export CSV</button>} />
    <WorkspaceDataStatus live={live} loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh().catch(() => undefined)} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{resources.map((item) => <Stat key={item.label} label={item.label} value={item.limit === undefined ? item.label.includes("storage") || item.label.includes("transfer") ? formatBytes(item.used) : item.used : `${item.used}${item.unit ?? ""} / ${item.limit}${item.unit ?? ""}`} detail={item.detail} icon={item.icon} tone={item.tone} />)}</div>
    {live ? <Panel title="Current metered consumption" description="The billing API currently exposes current totals, not historical buckets"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Transfer this month</p><p className="mt-2 text-2xl font-semibold text-zinc-100">{formatBytes(Number(data.usage.transferBytes))}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Backup catalog</p><p className="mt-2 text-2xl font-semibold text-zinc-100">{formatBytes(Number(data.usage.backupBytes))}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/10 p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Workspaces</p><p className="mt-2 text-2xl font-semibold text-zinc-100">{data.usage.workspaces}</p></div></div></Panel> : <Panel title="Consumption over time" description="Preview transfer bandwidth and remote operations" actions={<Segmented value={range} onChange={setRange} options={[{ value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "12m", label: "12 months" }]} />}><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily.map((item) => ({ ...item, bandwidth: Math.round(item.bandwidth * factor), operations: Math.round(item.operations * factor) }))} margin={{ left: -14, right: 10 }}><defs><linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#818cf8" stopOpacity={0.35} /><stop offset="1" stopColor="#818cf8" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="day" stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} /><YAxis stroke="#52525b" fontSize={9} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 11 }} /><Area isAnimationActive={false} type="monotone" dataKey="bandwidth" stroke="#818cf8" fill="url(#usageFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></Panel>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"><Panel title="Plan limits" description={`${plan[0].toUpperCase()}${plan.slice(1)} workspace allowance`}><div className="space-y-5">{resources.map((item) => { const percent = item.limit ? Math.round(item.used / item.limit * 100) : 0; return <div key={item.label}><div className="mb-2 flex items-center justify-between text-xs"><span className="text-zinc-400">{item.label}</span><span className="font-mono text-zinc-300">{item.limit ? `${percent}%` : "Metered"}</span></div>{item.limit ? <ProgressBar value={percent} tone={percent > 85 ? "rose" : percent > 65 ? "amber" : "indigo"} /> : <div className="h-1.5 rounded-full bg-white/[0.05]" />}<p className="mt-1.5 text-[10px] text-zinc-600">{item.detail}</p></div>; })}</div></Panel>{live ? <Panel title="Operations by server" description="Awaiting per-server metering buckets"><div className="grid min-h-64 place-items-center text-center"><div><Gauge className="mx-auto size-8 text-zinc-700" /><p className="mt-3 text-xs text-zinc-500">The current API reports organization totals only.</p><p className="mt-1 text-[10px] text-zinc-700">No synthetic per-server values are shown in live mode.</p></div></div></Panel> : <Panel title="Operations by server" description="Preview remote API calls this period"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: "Prod API", value: 42100 }, { name: "Frontend", value: 28400 }, { name: "Staging", value: 12200 }, { name: "Analytics", value: 6400 }]} layout="vertical" margin={{ left: 12 }}><CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={62} stroke="#71717a" fontSize={9} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 11 }} /><Bar isAnimationActive={false} dataKey="value" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={13} /></BarChart></ResponsiveContainer></div><button className={`${buttonClass} mt-2 w-full`} onClick={() => toast.info("Plan comparison opened")}><Gauge className="size-3.5" />Compare plans</button></Panel>}</div>
  </div>;
}

export default UsagePage;
