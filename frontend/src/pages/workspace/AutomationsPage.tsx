import { useMemo, useState } from "react";
import { Bot, CalendarClock, CheckCircle2, Clock3, Copy, Play, Plus, SearchX, Sparkles, Trash2, Webhook, Zap } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, SearchField, Stat, StatusBadge, Toggle } from "./_shared";

type Automation = { id: string; name: string; description: string; trigger: string; action: string; server: string; enabled: boolean; lastRun?: string; runs: number; status: "success" | "failed" | "idle"; triggerType?: BackendAutomation["triggerType"]; schedule?: string | null; actionType?: BackendAutomation["actionType"]; configuration?: Record<string, unknown> };
type BackendAutomation = { id: string; name: string; description: string; triggerType: "schedule" | "webhook" | "event" | "manual"; schedule?: string | null; actionType: "backup" | "deployment" | "sync" | "health_check" | "webhook"; configuration: Record<string, unknown>; enabled: boolean; lastRunAt?: string; nextRunAt?: string; createdAt: string };

const previewAutomations: Automation[] = [
  { id: "au1", name: "Nightly production backup", description: "Snapshot critical app data before the maintenance window.", trigger: "Daily at 02:00 UTC", action: "Create encrypted backup", server: "Production API", enabled: true, lastRun: new Date(Date.now() - 8 * 3_600_000).toISOString(), runs: 184, status: "success" },
  { id: "au2", name: "Deploy on main", description: "Build and promote after CI reports a green main branch.", trigger: "Git push · main", action: "Deploy acme-web", server: "Frontend Cluster", enabled: true, lastRun: new Date(Date.now() - 84 * 60_000).toISOString(), runs: 428, status: "success" },
  { id: "au3", name: "Log archive rotation", description: "Compress and download logs when storage reaches 70%.", trigger: "Disk > 70%", action: "Archive /storage/logs", server: "Staging", enabled: false, lastRun: new Date(Date.now() - 9 * 86_400_000).toISOString(), runs: 22, status: "failed" },
  { id: "au4", name: "Incident webhook", description: "Notify the platform channel when a server is unavailable.", trigger: "Server offline", action: "POST incident webhook", server: "All production", enabled: true, lastRun: new Date(Date.now() - 6 * 86_400_000).toISOString(), runs: 7, status: "success" },
];

const triggerLabel = (item: BackendAutomation) => item.triggerType === "schedule" ? item.schedule || "Scheduled" : item.triggerType === "webhook" ? "Incoming webhook" : item.triggerType === "event" ? "Workspace event" : "Manual";
const actionLabel = (type: BackendAutomation["actionType"]) => ({ backup: "Create backup", deployment: "Deploy project", sync: "Synchronize files", health_check: "Run health check", webhook: "Send webhook" })[type];
function toAutomation(item: BackendAutomation): Automation {
  return { id: item.id, name: item.name, description: item.description, trigger: triggerLabel(item), action: actionLabel(item.actionType), server: typeof item.configuration.target === "string" ? item.configuration.target : "Workspace", enabled: item.enabled, lastRun: item.lastRunAt, runs: 0, status: item.lastRunAt ? "success" : "idle", triggerType: item.triggerType, schedule: item.schedule, actionType: item.actionType, configuration: item.configuration };
}
const mapTrigger = (value: string): BackendAutomation["triggerType"] => value === "Schedule" ? "schedule" : value === "Incoming webhook" ? "webhook" : value === "Manual" ? "manual" : "event";
const mapAction = (value: string): BackendAutomation["actionType"] => value === "Create backup" ? "backup" : value === "Deploy project" ? "deployment" : value === "Synchronize files" ? "sync" : value === "Run health check" ? "health_check" : "webhook";

export function AutomationsPage() {
  const resource = useLiveResource(previewAutomations, [] as Automation[], async () => (await api.get<BackendAutomation[]>("/automations")).map(toAutomation));
  const { data: items, setData: setItems, live } = resource;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "Custom workspace automation.", trigger: "Schedule", schedule: "0 2 * * *", action: "Create backup", server: "Production API" });
  const filtered = useMemo(() => items.filter((item) => (filter === "all" || (filter === "active" ? item.enabled : !item.enabled)) && `${item.name} ${item.trigger} ${item.action} ${item.server}`.toLowerCase().includes(query.toLowerCase())), [items, filter, query]);

  async function create() {
    if (!draft.name.trim()) { toast.error("Name your automation"); return; }
    if (live) {
      try {
        const triggerType = mapTrigger(draft.trigger);
        const created = await api.post<BackendAutomation>("/automations", { name: draft.name.trim(), description: draft.description, triggerType, schedule: triggerType === "schedule" ? draft.schedule : null, actionType: mapAction(draft.action), configuration: { target: draft.server }, enabled: true });
        setItems((rows) => [toAutomation(created), ...rows]);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create automation"); return; }
    } else {
      setItems((rows) => [{ id: `au_${Date.now()}`, name: draft.name, description: draft.description, trigger: draft.trigger, action: draft.action, server: draft.server, enabled: true, runs: 0, status: "idle" }, ...rows]);
    }
    setOpen(false); setDraft((value) => ({ ...value, name: "" })); toast.success(live ? "Automation published" : "Preview automation published");
  }

  async function toggle(item: Automation, enabled: boolean) {
    if (live) {
      try { const updated = await api.patch<BackendAutomation>(`/automations/${item.id}`, { enabled }); setItems((rows) => rows.map((row) => row.id === item.id ? toAutomation(updated) : row)); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update automation"); return; }
    } else setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, enabled } : row));
    toast.success(enabled ? "Automation enabled" : "Automation paused");
  }

  async function run(item: Automation) {
    if (!live) { toast.success(`${item.name} preview run started`); return; }
    try { const result = await api.post<{ automation: BackendAutomation }>(`/automations/${item.id}/run`); setItems((rows) => rows.map((row) => row.id === item.id ? toAutomation(result.automation) : row)); toast.success(`${item.name} run accepted`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to run automation"); }
  }

  async function duplicate(item: Automation) {
    if (!live) { setItems((rows) => [{ ...item, id: `copy_${Date.now()}`, name: `${item.name} copy`, enabled: false }, ...rows]); toast.success("Preview workflow duplicated"); return; }
    try { const created = await api.post<BackendAutomation>("/automations", { name: `${item.name} copy`, description: item.description, triggerType: item.triggerType ?? "manual", schedule: item.schedule ?? null, actionType: item.actionType ?? "health_check", configuration: item.configuration ?? {}, enabled: false }); setItems((rows) => [toAutomation(created), ...rows]); toast.success("Workflow duplicated"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to duplicate automation"); }
  }

  async function remove(item: Automation) {
    if (live) { try { await api.delete(`/automations/${item.id}`); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to delete automation"); return; } }
    setItems((rows) => rows.filter((row) => row.id !== item.id)); toast.success(live ? "Automation deleted" : "Preview automation deleted");
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Orchestration" title="Automations" description="Turn recurring operations into safe, observable workflows with triggers, conditions, and approvals." actions={<button className={primaryButtonClass} onClick={() => setOpen(true)}><Plus className="size-3.5" />New automation</button>} />
    <WorkspaceDataStatus live={live} loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh().catch(() => undefined)} />
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="Active workflows" value={items.filter((item) => item.enabled).length} detail="Workspace automation rules" icon={Zap} tone="indigo" /><Stat label="Recorded runs" value={items.reduce((sum, item) => sum + item.runs, 0)} detail={live ? "Run counters are not exposed" : "98.7% preview success"} icon={Play} tone="emerald" /><Stat label="Latest activity" value={items.some((item) => item.lastRun) ? "Recorded" : "None"} detail="Runner timestamps" icon={Clock3} tone="sky" /></div>
    <Panel title="Workflow library" description="Live rules are evaluated by the Orbit runner" flush><div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row"><SearchField value={query} onChange={setQuery} placeholder="Search workflows" /><select className={controlClass} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All workflows</option><option value="active">Active</option><option value="paused">Paused</option></select></div>{filtered.length ? <div className="grid gap-3 p-3 md:grid-cols-2">{filtered.map((item) => <article key={item.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-4 transition hover:border-white/[0.12]"><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">{item.action.toLowerCase().includes("webhook") ? <Webhook className="size-4" /> : item.trigger.toLowerCase().includes("schedule") || item.trigger.includes("*") ? <CalendarClock className="size-4" /> : <Bot className="size-4" />}</span><div className="flex items-center gap-2"><StatusBadge status={item.enabled ? "active" : "paused"} /><Toggle checked={item.enabled} label={`Toggle ${item.name}`} onChange={(enabled) => void toggle(item, enabled)} /></div></div><h3 className="mt-4 text-sm font-semibold text-zinc-100">{item.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">{item.description}</p><div className="mt-4 grid grid-cols-[24px_minmax(0,1fr)] gap-y-2 border-y border-white/[0.06] py-3 text-[10px]"><Zap className="size-3.5 text-amber-400" /><span><strong className="font-medium text-zinc-300">When</strong> · {item.trigger}</span><Sparkles className="size-3.5 text-indigo-400" /><span><strong className="font-medium text-zinc-300">Then</strong> · {item.action}</span></div><div className="mt-3 flex items-center justify-between"><div className="text-[10px] text-zinc-600"><p>{live ? "Audited workflow" : `${item.runs} preview runs`} · {item.server}</p><p className="mt-1">{item.lastRun ? `Last run ${relativeTime(item.lastRun)}` : "Never run"}</p></div><div className="flex"><IconButton title="Duplicate" onClick={() => void duplicate(item)}><Copy className="size-3.5" /></IconButton><IconButton title="Delete" onClick={() => void remove(item)}><Trash2 className="size-3.5" /></IconButton><button className={buttonClass} disabled={!item.enabled} onClick={() => void run(item)}><Play className="size-3" />Run</button></div></div></article>)}</div> : <EmptyState icon={SearchX} title="No workflows found" description="Try another filter or build a new automation from scratch." />}</Panel>
    <Modal open={open} onClose={() => setOpen(false)} title="Build automation" description="Choose a trigger and the server operation Orbit should perform." footer={<><button className={buttonClass} onClick={() => setOpen(false)}>Cancel</button><button className={primaryButtonClass} onClick={() => void create()}><CheckCircle2 className="size-3.5" />Publish workflow</button></>} wide><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-zinc-400 sm:col-span-2">Workflow name<input autoFocus className={`${controlClass} mt-1.5 w-full`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Pre-deploy database snapshot" /></label><label className="text-xs text-zinc-400">Trigger<select className={`${controlClass} mt-1.5 w-full`} value={draft.trigger} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}><option>Schedule</option><option>Workspace event</option><option>Incoming webhook</option><option>Manual</option></select></label><label className="text-xs text-zinc-400">Action<select className={`${controlClass} mt-1.5 w-full`} value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })}><option>Create backup</option><option>Deploy project</option><option>Run health check</option><option>Synchronize files</option><option>Send webhook</option></select></label>{draft.trigger === "Schedule" ? <label className="text-xs text-zinc-400">Schedule<input className={`${controlClass} mt-1.5 w-full font-mono`} value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })} /></label> : null}<label className="text-xs text-zinc-400">Target label<input className={`${controlClass} mt-1.5 w-full`} value={draft.server} onChange={(event) => setDraft({ ...draft, server: event.target.value })} /></label><label className="text-xs text-zinc-400 sm:col-span-2">Description<textarea className={`${controlClass} mt-1.5 h-auto w-full py-2`} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div></Modal>
  </div>;
}

export default AutomationsPage;
