import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Gauge, Pause, Play, Plus, RefreshCw, SearchX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { formatBytes, relativeTime } from "@/lib/utils";
import type { Transfer } from "@/types";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, ProgressBar, SearchField, Stat, StatusBadge, tableClass, tableWrapClass, tdClass, thClass } from "./_shared";

type ServerOption = { id: string; name: string; rootPath: string };
type BackendTransfer = { id: string; serverId: string; serverName?: string; name: string; direction: Transfer["direction"]; sourcePath: string; destinationPath: string; status: string; progress: number; bytesTotal: number | string; bytesTransferred: number | string; createdAt: string };

function toTransfer(item: BackendTransfer): Transfer {
  return { id: item.id, name: item.name, server: item.serverName ?? "Server", direction: item.direction, status: item.status === "completed" ? "complete" : item.status as Transfer["status"], progress: Number(item.progress ?? 0), bytes: Number(item.bytesTransferred ?? 0), totalBytes: Number(item.bytesTotal ?? 0), speed: item.status === "running" ? "In progress" : "—", startedAt: item.createdAt };
}

export function TransfersPage() {
  const transfers = useLiveResource([] as Transfer[], async () => (await api.get<BackendTransfer[]>("/transfers?limit=100")).map(toTransfer), 10000);
  const servers = useLiveResource([] as ServerOption[], () => api.get<ServerOption[]>("/servers?limit=100"));
  const { data: items, setData: setItems, live } = transfers;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [paused, setPaused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", serverId: "", direction: "upload" as Transfer["direction"], sourcePath: "/release.txt", destinationPath: "/release.txt", content: "" });
  const filtered = useMemo(() => items.filter((item) => (status === "all" || item.status === status) && `${item.name} ${item.server}`.toLowerCase().includes(query.toLowerCase())), [items, query, status]);
  const active = items.filter((item) => item.status === "running").length;
  const queued = items.filter((item) => item.status === "queued").length;
  const transferred = items.filter((item) => item.status === "complete").reduce((total, item) => total + item.totalBytes, 0);

  async function cancel(id: string) {
    if (live) {
      try { await api.post(`/transfers/${id}/cancel`); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to cancel transfer"); return; }
    }
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: "cancelled" } : item));
    toast.success("Transfer cancelled");
  }

  function retry(id: string) {
    if (live) { toast.info("Retry is not exposed by the transfer API yet. Create a new transfer instead."); return; }
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: "queued", progress: 0, bytes: 0, speed: "—" } : item));
    toast.success("Preview transfer returned to the queue");
  }

  async function createTransfer() {
    if (!draft.name.trim()) { toast.error("Name the transfer first"); return; }
    const server = servers.data.find((item) => item.id === draft.serverId) ?? servers.data[0];
    if (!server) { toast.error("Connect a server before creating a transfer"); return; }
    if (live) {
      try {
        const created = await api.post<BackendTransfer>("/transfers", { serverId: server.id, name: draft.name.trim(), direction: draft.direction, sourcePath: draft.sourcePath, destinationPath: draft.destinationPath, ...(draft.direction === "upload" ? { content: draft.content, encoding: "utf8" } : {}), executeNow: true });
        setItems((current) => [toTransfer({ ...created, serverName: server.name }), ...current]);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create transfer"); return; }
    } else {
      setItems((current) => [{ id: `t_${Date.now()}`, name: draft.name.trim(), server: server.name, direction: draft.direction, status: "queued", progress: 0, bytes: 0, totalBytes: 128_000_000, speed: "—", startedAt: new Date().toISOString() }, ...current]);
    }
    setDraft((current) => ({ ...current, name: "" }));
    setCreateOpen(false);
    toast.success(live ? "Transfer completed securely" : "Preview transfer added to the queue");
  }

  function toggleQueue() {
    if (live) { toast.info("Queue-wide pause is not exposed by the API; cancel individual active transfers instead."); return; }
    setPaused((value) => !value);
    toast.info(paused ? "Preview queue resumed" : "Preview queue paused");
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Delivery" title="Transfers" description="One queue for uploads, downloads, and bidirectional sync jobs across every server." actions={<><button className={buttonClass} onClick={toggleQueue}>{paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}{paused ? "Resume queue" : "Pause all"}</button><button className={primaryButtonClass} onClick={() => setCreateOpen(true)}><Plus className="size-3.5" />New transfer</button></>} />
    <WorkspaceDataStatus live={live} loading={transfers.loading || servers.loading} error={transfers.error ?? servers.error} onRetry={() => { void transfers.refresh().catch(() => undefined); void servers.refresh().catch(() => undefined); }} />
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="Active now" value={active} detail={paused ? "Queue paused" : "Processing normally"} icon={Gauge} tone="emerald" /><Stat label="Waiting" value={queued} detail="Priority ordered" icon={Pause} tone="amber" /><Stat label="Completed volume" value={formatBytes(transferred)} detail="Loaded history" icon={ArrowUpFromLine} tone="indigo" /></div>
    <Panel title="Transfer queue" description={`${filtered.length} visible of ${items.length} jobs`} actions={<button className={buttonClass} onClick={() => { if (live) { toast.info("Completed transfers remain in the server audit trail."); return; } setItems((current) => current.filter((item) => item.status !== "complete" && item.status !== "cancelled")); toast.success("Preview jobs cleared"); }}><Trash2 className="size-3.5" />Clear finished</button>} flush>
      <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row"><SearchField value={query} onChange={setQuery} placeholder="Search file or server" /><select value={status} onChange={(event) => setStatus(event.target.value)} className={controlClass}><option value="all">All statuses</option><option value="running">Running</option><option value="queued">Queued</option><option value="complete">Complete</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></div>
      {filtered.length ? <div className={tableWrapClass}><table className={tableClass}><thead><tr><th className={thClass}>Transfer</th><th className={thClass}>Direction</th><th className={thClass}>Progress</th><th className={thClass}>Speed / ETA</th><th className={thClass}>Status</th><th className={thClass} /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="hover:bg-white/[0.02]"><td className={tdClass}><p className="max-w-56 truncate font-medium text-zinc-200">{item.name}</p><p className="mt-1 text-[10px] text-zinc-600">{item.server} · {relativeTime(item.startedAt)}</p></td><td className={tdClass}><span className="inline-flex items-center gap-1.5 capitalize">{item.direction === "download" ? <ArrowDownToLine className="size-3.5 text-sky-400" /> : <ArrowUpFromLine className="size-3.5 text-indigo-400" />}{item.direction}</span></td><td className={tdClass}><div className="w-44"><div className="mb-1.5 flex justify-between text-[10px]"><span>{formatBytes(item.bytes)} / {formatBytes(item.totalBytes)}</span><span>{item.progress}%</span></div><ProgressBar value={item.progress} tone={item.status === "failed" ? "rose" : item.status === "complete" ? "emerald" : "indigo"} /></div></td><td className={tdClass}><p>{item.speed}</p><p className="mt-1 text-[10px] text-zinc-600">{item.eta ? `ETA ${item.eta}` : "No estimate"}</p></td><td className={tdClass}><StatusBadge status={item.status} /></td><td className={tdClass}><div className="flex justify-end">{item.status === "failed" || item.status === "cancelled" ? <IconButton title="Retry" onClick={() => retry(item.id)}><RefreshCw className="size-3.5" /></IconButton> : item.status === "running" || item.status === "queued" ? <IconButton title="Cancel" onClick={() => void cancel(item.id)}><Ban className="size-3.5" /></IconButton> : null}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={SearchX} title="No transfers found" description="Adjust the filters or create a new transfer to move files between a client and server." action={<button className={primaryButtonClass} onClick={() => setCreateOpen(true)}>New transfer</button>} />}
    </Panel>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create transfer" description="Run a secure remote file operation with workspace conflict rules." footer={<><button className={buttonClass} onClick={() => setCreateOpen(false)}>Cancel</button><button className={primaryButtonClass} onClick={() => void createTransfer()}>Run transfer</button></>}>
      <div className="space-y-4"><label className="block text-xs text-zinc-400">Transfer name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Release artifact" className={`${controlClass} mt-1.5 w-full`} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Server<select value={draft.serverId} onChange={(event) => setDraft({ ...draft, serverId: event.target.value })} className={`${controlClass} mt-1.5 w-full`}>{servers.data.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label><label className="text-xs text-zinc-400">Direction<select value={draft.direction} onChange={(event) => setDraft({ ...draft, direction: event.target.value as Transfer["direction"] })} className={`${controlClass} mt-1.5 w-full`}><option value="upload">Upload</option><option value="download">Download</option><option value="sync">Server-side sync</option></select></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Source path<input value={draft.sourcePath} onChange={(event) => setDraft({ ...draft, sourcePath: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label><label className="text-xs text-zinc-400">Destination path<input value={draft.destinationPath} onChange={(event) => setDraft({ ...draft, destinationPath: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label></div>{draft.direction === "upload" ? <label className="block text-xs text-zinc-400">UTF-8 content<textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={5} className={`${controlClass} mt-1.5 h-auto w-full py-2 font-mono`} /></label> : null}</div>
    </Modal>
  </div>;
}

export default TransfersPage;
