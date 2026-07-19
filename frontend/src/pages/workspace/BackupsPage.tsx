import { useMemo, useState } from "react";
import { Archive, CalendarClock, CheckCircle2, DatabaseBackup, Download, MoreHorizontal, Plus, RotateCcw, SearchX, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { formatBytes, formatNumber, relativeTime } from "@/lib/utils";
import type { Backup } from "@/types";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, SearchField, Stat, StatusBadge, tableClass, tableWrapClass, tdClass, thClass, Toggle } from "./_shared";

const previewSchedules = [
  { id: "s1", name: "Production nightly", server: "Production API", cadence: "Every day · 02:00 UTC", retention: "30 days", enabled: true },
  { id: "s2", name: "Frontend release", server: "Frontend Cluster", cadence: "Before each deployment", retention: "14 days", enabled: true },
  { id: "s3", name: "Staging weekly", server: "Staging", cadence: "Sunday · 04:30 UTC", retention: "7 days", enabled: false },
];
type ServerOption = { id: string; name: string };
type BackendBackup = { id: string; serverId: string; serverName?: string; name: string; path: string; status: string; sizeBytes: number | string; fileCount: number; retentionUntil: string; createdAt: string };

function toBackup(item: BackendBackup): Backup {
  return { id: item.id, name: item.name, server: item.serverName ?? "Server", type: "snapshot", status: item.status === "completed" ? "complete" : item.status as Backup["status"], size: Number(item.sizeBytes ?? 0), files: Number(item.fileCount ?? 0), createdAt: item.createdAt, retentionUntil: item.retentionUntil, encrypted: false };
}

export function BackupsPage() {
  const backups = useLiveResource([] as Backup[], async () => (await api.get<BackendBackup[]>("/backups?limit=100")).map(toBackup));
  const servers = useLiveResource([] as ServerOption[], () => api.get<ServerOption[]>("/servers?limit=100"));
  const { data: items, setData: setItems, live } = backups;
  const [previewRows, setPreviewRows] = useState(previewSchedules);
  const scheduleRows = live ? [] : previewRows;
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"backups" | "schedules">("backups");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "On-demand backup", serverId: "", path: "/", type: "snapshot" as Backup["type"], retentionDays: 30 });
  const filtered = useMemo(() => items.filter((item) => `${item.name} ${item.server} ${item.type}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const total = items.reduce((sum, item) => sum + item.size, 0);

  async function createBackup() {
    if (!draft.name.trim()) { toast.error("Backup name is required"); return; }
    const server = servers.data.find((row) => row.id === draft.serverId) ?? servers.data[0];
    if (!server) { toast.error("Connect a server before creating a backup"); return; }
    if (live) {
      try {
        const created = await api.post<BackendBackup>("/backups", { serverId: server.id, name: draft.name.trim(), path: draft.path, retentionDays: draft.retentionDays });
        setItems((current) => [toBackup({ ...created, serverName: server.name }), ...current]);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create backup"); return; }
    } else {
      setItems((current) => [{ id: `b_${Date.now()}`, name: draft.name, server: server.name, type: draft.type, status: "running", size: 0, files: 0, createdAt: new Date().toISOString(), retentionUntil: new Date(Date.now() + draft.retentionDays * 86_400_000).toISOString(), encrypted: true }, ...current]);
    }
    setCreateOpen(false);
    toast.success(live ? "Recovery point created" : "Preview backup started");
  }

  async function restore(item: Backup) {
    if (!live) { toast.success(`Preview restore for ${item.name} queued`); return; }
    try { await api.post(`/backups/${item.id}/restore`); toast.success(`${item.name} restored`); await backups.refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to restore backup"); }
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Recovery" title="Backups" description="Snapshots, retention policies, and one-click recovery across your fleet." actions={<><button className={buttonClass} onClick={() => live ? toast.info("Catalog integrity verification is not exposed by the API yet.") : toast.success("Preview catalog verified")}>Verify integrity</button><button className={primaryButtonClass} onClick={() => setCreateOpen(true)}><Plus className="size-3.5" />Create backup</button></>} />
    <WorkspaceDataStatus live={live} loading={backups.loading || servers.loading} error={backups.error ?? servers.error} onRetry={() => { void backups.refresh().catch(() => undefined); void servers.refresh().catch(() => undefined); }} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Stored backups" value={items.length} detail={`${items.filter((x) => x.status === "complete").length} recovery-ready`} icon={Archive} /><Stat label="Protected data" value={formatBytes(total)} detail={`${formatNumber(items.reduce((sum, item) => sum + item.files, 0))} files`} icon={DatabaseBackup} tone="sky" /><Stat label="Active schedules" value={scheduleRows.filter((x) => x.enabled).length} detail={live ? "Scheduling API not configured" : "Next preview run in 3h 18m"} icon={CalendarClock} tone="amber" /><Stat label="Storage policy" value={live ? "Managed" : "AES-256"} detail={live ? "Configured by the deployment" : "Preview encryption policy"} icon={ShieldCheck} tone="emerald" /></div>
    <div className="flex gap-1 border-b border-white/[0.07]"><button onClick={() => setTab("backups")} className={`border-b px-3 py-2 text-xs ${tab === "backups" ? "border-indigo-400 text-white" : "border-transparent text-zinc-500"}`}>Recovery points</button><button onClick={() => setTab("schedules")} className={`border-b px-3 py-2 text-xs ${tab === "schedules" ? "border-indigo-400 text-white" : "border-transparent text-zinc-500"}`}>Schedules</button></div>
    {tab === "backups" ? <Panel title="Recovery points" description="Immutable copies available to restore" flush><div className="border-b border-white/[0.06] p-3"><SearchField value={query} onChange={setQuery} placeholder="Search backups" /></div>{filtered.length ? <div className={tableWrapClass}><table className={tableClass}><thead><tr><th className={thClass}>Backup</th><th className={thClass}>Type</th><th className={thClass}>Contents</th><th className={thClass}>Created</th><th className={thClass}>Retention</th><th className={thClass}>Status</th><th className={thClass} /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="hover:bg-white/[0.02]"><td className={tdClass}><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300"><Archive className="size-3.5" /></span><div><p className="font-medium text-zinc-200">{item.name}</p><p className="mt-1 text-[10px] text-zinc-600">{item.server}{item.encrypted ? " · encrypted" : ""}</p></div></div></td><td className={`${tdClass} capitalize`}>{item.type}</td><td className={tdClass}><p>{formatBytes(item.size)}</p><p className="mt-1 text-[10px] text-zinc-600">{formatNumber(item.files)} files</p></td><td className={tdClass}>{relativeTime(item.createdAt)}</td><td className={tdClass}>{new Date(item.retentionUntil).toLocaleDateString()}</td><td className={tdClass}><StatusBadge status={item.status} /></td><td className={tdClass}><div className="flex justify-end"><IconButton title="Restore" disabled={item.status !== "complete"} onClick={() => void restore(item)}><RotateCcw className="size-3.5" /></IconButton><IconButton title="Download" disabled={item.status !== "complete"} onClick={() => toast.info(live ? "Backup download is not exposed by the API yet." : "Preview download prepared")}><Download className="size-3.5" /></IconButton><IconButton title="Delete" onClick={() => { if (live) { toast.info("Backup deletion is intentionally not exposed by the recovery API."); return; } setItems((current) => current.filter((row) => row.id !== item.id)); toast.success("Preview backup deleted"); }}><Trash2 className="size-3.5" /></IconButton></div></td></tr>)}</tbody></table></div> : <EmptyState icon={SearchX} title="No recovery points" description="No backups match your current search." />}</Panel> : <Panel title="Backup schedules" description={live ? "Scheduling requires a backend automation policy endpoint" : "Preview automated recovery policies"} actions={<button className={buttonClass} onClick={() => toast.info(live ? "Backup schedule management is not exposed by the API yet." : "Preview schedule editor opened")}>New schedule</button>} flush>{scheduleRows.length ? <div className="divide-y divide-white/[0.06]">{scheduleRows.map((schedule) => <div key={schedule.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_200px_120px_auto] sm:items-center"><div><p className="text-sm font-medium text-zinc-200">{schedule.name}</p><p className="mt-1 text-[10px] text-zinc-600">{schedule.server}</p></div><div><p className="text-xs text-zinc-300">{schedule.cadence}</p><p className="mt-1 text-[10px] text-zinc-600">Retention {schedule.retention}</p></div><StatusBadge status={schedule.enabled ? "active" : "paused"} /><div className="flex items-center justify-end gap-2"><Toggle checked={schedule.enabled} label={`Toggle ${schedule.name}`} onChange={(enabled) => { setPreviewRows((current) => current.map((row) => row.id === schedule.id ? { ...row, enabled } : row)); toast.success(enabled ? "Preview schedule enabled" : "Preview schedule paused"); }} /><IconButton><MoreHorizontal className="size-4" /></IconButton></div></div>)}</div> : <EmptyState icon={CalendarClock} title="Scheduling API not configured" description="Use Automations for live scheduled workflows; recovery points remain fully available here." />}</Panel>}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create recovery point" description="Snapshot a confined remote path and retain it under the workspace policy." footer={<><button className={buttonClass} onClick={() => setCreateOpen(false)}>Cancel</button><button className={primaryButtonClass} onClick={() => void createBackup()}><CheckCircle2 className="size-3.5" />Start backup</button></>}><div className="grid gap-4"><label className="text-xs text-zinc-400">Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label><label className="text-xs text-zinc-400">Server<select value={draft.serverId} onChange={(event) => setDraft({ ...draft, serverId: event.target.value })} className={`${controlClass} mt-1.5 w-full`}>{servers.data.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Remote path<input value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label><label className="text-xs text-zinc-400">Retention days<input type="number" min={1} max={3650} value={draft.retentionDays} onChange={(event) => setDraft({ ...draft, retentionDays: Number(event.target.value) })} className={`${controlClass} mt-1.5 w-full`} /></label></div>{!live ? <label className="text-xs text-zinc-400">Preview type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Backup["type"] })} className={`${controlClass} mt-1.5 w-full`}><option value="snapshot">Snapshot</option><option value="incremental">Incremental</option><option value="full">Full</option></select></label> : null}</div></Modal>
  </div>;
}

export default BackupsPage;
