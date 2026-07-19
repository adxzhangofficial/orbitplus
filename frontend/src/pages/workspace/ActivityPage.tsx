import { useMemo, useState } from "react";
import { Activity, Download, Eye, FileClock, Filter, SearchX, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { relativeTime } from "@/lib/utils";
import type { ActivityEvent } from "@/types";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, SearchField, Stat, StatusBadge, tableClass, tableWrapClass, tdClass, thClass } from "./_shared";

type BackendActivity = { id: string; action: string; resourceType: string; resourceId?: string; requestId?: string; ipAddress?: string; metadata?: { statusCode?: number; path?: string }; createdAt: string; actor?: string; actorEmail?: string };
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SY"; }
function toActivity(item: BackendActivity): ActivityEvent {
  const actor = item.actor ?? "System actor";
  const method = item.action.split(".")[0];
  const status = Number(item.metadata?.statusCode ?? 200);
  const severity: ActivityEvent["severity"] = status >= 400 ? "critical" : method === "delete" ? "warning" : method === "post" ? "success" : "info";
  return { id: item.id, actor, initials: initials(actor), action: item.action, resource: item.resourceId ?? item.metadata?.path ?? item.resourceType, resourceType: item.resourceType, severity, createdAt: item.createdAt, ip: item.ipAddress };
}

export function ActivityPage() {
  const resourceState = useLiveResource([] as ActivityEvent[], async () => (await api.get<BackendActivity[]>("/activity?limit=100")).map(toActivity), 20000);
  const { data: events, live } = resourceState;
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [resource, setResource] = useState("all");
  const [selected, setSelected] = useState<ActivityEvent>();
  const filtered = useMemo(() => events.filter((item) => (severity === "all" || item.severity === severity) && (resource === "all" || item.resourceType === resource) && `${item.actor} ${item.action} ${item.resource} ${item.server ?? ""} ${item.ip ?? ""}`.toLowerCase().includes(query.toLowerCase())), [events, query, severity, resource]);
  const resourceTypes = [...new Set(events.map((event) => event.resourceType))];
  const today = events.filter((event) => new Date(event.createdAt).toDateString() === new Date().toDateString()).length;

  function exportLog() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "orbit-audit-log.json"; anchor.click(); URL.revokeObjectURL(url); toast.success("Audit export downloaded");
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Governance" title="Activity & audit log" description="An immutable trail of changes, sessions, deployments, and security events across the workspace." actions={<button className={buttonClass} onClick={exportLog}><Download className="size-3.5" />Export JSON</button>} />
    <WorkspaceDataStatus live={live} loading={resourceState.loading} error={resourceState.error} onRetry={() => void resourceState.refresh().catch(() => undefined)} />
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="Events today" value={today} detail={`${events.length} loaded records`} icon={Activity} /><Stat label="Elevated events" value={events.filter((event) => event.severity === "critical" || event.severity === "warning").length} detail="Derived from method and response" icon={ShieldCheck} tone="rose" /><Stat label="Audit retention" value={live ? "Policy" : "365d"} detail={live ? "Controlled by workspace storage" : "Preview plan policy"} icon={FileClock} tone="sky" /></div>
    <Panel title="Audit events" description={`${filtered.length} matching immutable records`} actions={<button className={buttonClass} onClick={() => { setQuery(""); setSeverity("all"); setResource("all"); }}><Filter className="size-3.5" />Reset filters</button>} flush><div className="grid gap-2 border-b border-white/[0.06] p-3 sm:grid-cols-[minmax(0,1fr)_170px_170px]"><SearchField value={query} onChange={setQuery} placeholder="Search actor, action, IP, or resource" /><select value={resource} onChange={(event) => setResource(event.target.value)} className={controlClass}><option value="all">All resources</option>{resourceTypes.map((type) => <option key={type}>{type}</option>)}</select><select value={severity} onChange={(event) => setSeverity(event.target.value)} className={controlClass}><option value="all">All severity</option><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div>{filtered.length ? <div className={tableWrapClass}><table className={tableClass}><thead><tr><th className={thClass}>Time</th><th className={thClass}>Actor</th><th className={thClass}>Event</th><th className={thClass}>Resource</th><th className={thClass}>Origin</th><th className={thClass}>Severity</th><th className={thClass} /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="hover:bg-white/[0.02]"><td className={tdClass}><p>{relativeTime(item.createdAt)}</p><p className="mt-1 whitespace-nowrap text-[10px] text-zinc-600">{new Date(item.createdAt).toLocaleString()}</p></td><td className={tdClass}><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-[9px] font-semibold text-zinc-300">{item.initials}</span><span className="font-medium text-zinc-300">{item.actor}</span></div></td><td className={tdClass}><span className="capitalize">{item.action}</span></td><td className={tdClass}><p className="max-w-52 truncate font-medium text-zinc-300">{item.resource}</p><p className="mt-1 text-[10px] text-zinc-600">{item.resourceType}</p></td><td className={tdClass}><p>{item.server ?? "Workspace"}</p><p className="mt-1 font-mono text-[10px] text-zinc-600">{item.ip ?? "System actor"}</p></td><td className={tdClass}><StatusBadge status={item.severity} /></td><td className={tdClass}><IconButton title="Inspect event" onClick={() => setSelected(item)}><Eye className="size-3.5" /></IconButton></td></tr>)}</tbody></table></div> : <EmptyState icon={SearchX} title="No audit events" description="No events match all of the selected filters." />}</Panel>
    <Modal open={Boolean(selected)} onClose={() => setSelected(undefined)} title="Audit event details" description="Recorded context is read-only and tamper evident.">{selected ? <div className="space-y-4"><div className="grid gap-px overflow-hidden rounded-lg bg-white/[0.06] sm:grid-cols-2">{[["Event ID", selected.id], ["Occurred", new Date(selected.createdAt).toLocaleString()], ["Actor", selected.actor], ["IP address", selected.ip ?? "System actor"], ["Action", selected.action], ["Severity", selected.severity], ["Resource", selected.resource], ["Scope", selected.server ?? "Workspace"]].map(([label, value]) => <div key={label} className="bg-[#101218] p-3"><p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 break-all text-xs text-zinc-300">{value}</p></div>)}</div><div className="rounded-lg border border-white/[0.07] bg-black/20 p-3 font-mono text-[10px] leading-5 text-zinc-500">event_id={selected.id}<br />source=orbit_audit_stream<br />mode=read_only</div></div> : null}</Modal>
  </div>;
}

export const AuditLogPage = ActivityPage;
export default ActivityPage;
