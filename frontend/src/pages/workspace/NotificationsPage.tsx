import { useMemo, useState } from "react";
import { Bell, BellOff, Check, CheckCheck, CircleAlert, Inbox, Mail, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { useLiveResource } from "@/lib/use-live-resource";
import { cn, relativeTime } from "@/lib/utils";
import type { Notification } from "@/types";
import { buttonClass, EmptyState, IconButton, PageHeader, Panel, Segmented, StatusBadge, Toggle } from "./_shared";

type BackendNotification = { id: string; type: string; title: string; message: string; link?: string; readAt?: string; createdAt: string };
function toNotification(item: BackendNotification): Notification {
  const type = ["info", "success", "warning", "critical"].includes(item.type) ? item.type as Notification["type"] : "info";
  return { id: item.id, title: item.title, body: item.message, type, read: Boolean(item.readAt), createdAt: item.createdAt };
}

export function NotificationsPage() {
  const resource = useLiveResource([] as Notification[], async () => (await api.get<BackendNotification[]>("/notifications")).map(toNotification), 30000);
  const { data: items, setData: setItems, live } = resource;
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [preferences, setPreferences] = useState({ deployments: true, backups: true, security: true, monitoring: true, digest: false });
  const visible = useMemo(() => filter === "unread" ? items.filter((item) => !item.read) : items, [items, filter]);
  const unread = items.filter((item) => !item.read).length;

  async function mark(item: Notification, read: boolean) {
    if (live && !read) { toast.info("The API does not expose a mark-unread operation yet."); return; }
    if (live && read && !item.read) {
      try { await api.patch(`/notifications/${item.id}/read`); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to mark notification read"); return; }
    }
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, read } : row));
  }

  async function markAll() {
    if (live) {
      try { await api.post("/notifications/read-all"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to mark notifications read"); return; }
    }
    setItems((rows) => rows.map((row) => ({ ...row, read: true }))); toast.success("All notifications marked read");
  }

  function updatePreference(key: keyof typeof preferences, checked: boolean) {
    if (live) { toast.info("Notification preferences are not exposed by the API yet."); return; }
    setPreferences((current) => ({ ...current, [key]: checked })); toast.success("Preview preferences saved");
  }
  const iconFor = (item: Notification) => item.type === "critical" ? ShieldAlert : item.type === "warning" ? CircleAlert : item.type === "success" ? Check : Bell;

  return <div className="space-y-5">
    <PageHeader eyebrow="Inbox" title="Notifications" description="Operational changes, security notices, and alerts that need your attention." actions={<button className={buttonClass} disabled={!unread} onClick={() => void markAll()}><CheckCheck className="size-3.5" />Mark all read</button>} />
    <WorkspaceDataStatus live={live} loading={resource.loading} error={resource.error} onRetry={() => void resource.refresh().catch(() => undefined)} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Inbox" description={`${unread} unread notification${unread === 1 ? "" : "s"}`} actions={<Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} />} flush>{visible.length ? <div className="divide-y divide-white/[0.06]">{visible.map((item) => { const Icon = iconFor(item); return <article key={item.id} className={cn("grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 px-4 py-4 transition hover:bg-white/[0.02]", item.read && "opacity-60")}><button aria-label={`Mark ${item.read ? "unread" : "read"}`} onClick={() => void mark(item, !item.read)} className={cn("grid size-9 place-items-center rounded-lg border", item.type === "critical" ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : item.type === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : item.type === "warning" ? "border-amber-400/20 bg-amber-400/10 text-amber-300" : "border-sky-400/20 bg-sky-400/10 text-sky-300")}><Icon className="size-4" /></button><button className="min-w-0 text-left" onClick={() => void mark(item, true)}><span className="flex items-center gap-2"><strong className="truncate text-sm font-medium text-zinc-200">{item.title}</strong>{!item.read ? <i className="size-1.5 shrink-0 rounded-full bg-indigo-400" /> : null}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{item.body}</span><span className="mt-2 block text-[10px] text-zinc-600">{relativeTime(item.createdAt)}</span></button><div className="flex items-start gap-1"><StatusBadge status={item.type} /><IconButton title="Delete" onClick={() => { if (live) { toast.info("Notification deletion is not exposed by the API yet."); return; } setItems((rows) => rows.filter((row) => row.id !== item.id)); toast.success("Preview notification removed"); }}><Trash2 className="size-3.5" /></IconButton></div></article>; })}</div> : <EmptyState icon={filter === "unread" ? CheckCheck : Inbox} title={filter === "unread" ? "You're all caught up" : "No notifications yet"} description="New deployment, backup, monitoring, and security events will appear here." />}</Panel>
      <Panel title="Notification preferences" description={live ? "Preference API not configured" : "Preview event preferences"}><div className="space-y-1">{([{ key: "deployments", label: "Deployments", description: "Build results and rollback activity", icon: Check }, { key: "backups", label: "Backups", description: "Failures and retention notices", icon: Inbox }, { key: "security", label: "Security", description: "Sign-ins and access changes", icon: ShieldAlert }, { key: "monitoring", label: "Monitoring", description: "Threshold and availability alerts", icon: Bell }, { key: "digest", label: "Weekly digest", description: "A summary every Monday", icon: Mail }] as const).map(({ key, label, description, icon: Icon }) => <div key={key} className="flex items-center gap-3 border-b border-white/[0.05] py-3 last:border-0"><span className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-zinc-500"><Icon className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium text-zinc-300">{label}</p><p className="mt-0.5 text-[10px] text-zinc-600">{description}</p></div><Toggle checked={preferences[key]} label={`Toggle ${label}`} onChange={(checked) => updatePreference(key, checked)} /></div>)}</div><div className="mt-4 rounded-lg border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center gap-2 text-xs font-medium text-zinc-300"><BellOff className="size-3.5" />Quiet hours</div><p className="mt-1 text-[10px] leading-4 text-zinc-600">Critical security and outage alerts always bypass quiet hours.</p><button className={`${buttonClass} mt-3 w-full`} onClick={() => toast.info(live ? "Quiet hours are not exposed by the API yet." : "Preview quiet hours set")}>Configure quiet hours</button></div></Panel>
    </div>
  </div>;
}

export default NotificationsPage;
