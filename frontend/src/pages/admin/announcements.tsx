import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Eye, Mail, Megaphone, MessageSquare, MoreHorizontal, MousePointerClick, Pause, Plus, Send, Smartphone, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { adminApi, AdminDataNotice, useAdminResource, type AdminAnnouncement, type AnnouncementAudience, type AnnouncementDelivery, type AnnouncementReach } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Modal, Pagination, Panel, SearchBox, Stat, StatusPill, usePagination } from "./_shared";

/**
 * Customer announcements.
 *
 * Views and clicks are counted from receipt rows, one per person, so the
 * figures shown are unique by construction and a reload cannot inflate them.
 *
 * Reach is asked of the server whenever the audience changes rather than
 * estimated in the browser: the composer should say how many people will
 * actually receive this, not how many the front end guesses.
 */

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: "All customers",
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
  paid: "Pro & Enterprise",
};

const blank = {
  title: "", body: "", audience: "all" as AnnouncementAudience, sendEmail: false,
  actionLabel: "", actionUrl: "", publishAt: "",
};

export function AnnouncementsAdminPage() {
  const { data: rows, source, error, refresh } = useAdminResource<AdminAnnouncement[]>(
    "admin.announcements",
    [],
    () => adminApi.announcements(),
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [delivery, setDelivery] = useState<AnnouncementDelivery>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [reach, setReach] = useState<AnnouncementReach>();
  const [busy, setBusy] = useState(false);

  const selected = rows.find((item) => item.id === selectedId);
  const filtered = useMemo(() => rows.filter((item) => `${item.title} ${AUDIENCE_LABEL[item.audience]} ${item.authorName ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || item.status === status)), [query, rows, status]);
  const pagination = usePagination(filtered, 7);

  // Asked of the server, because the reachable audience depends on plans and
  // opt-outs the browser does not know.
  const loadReach = useCallback((audience: AnnouncementAudience) => {
    adminApi.announcementReach(audience).then(setReach).catch(() => setReach(undefined));
  }, []);

  useEffect(() => {
    if (source !== "live") return;
    loadReach(draft.audience);
  }, [draft.audience, loadReach, source]);

  useEffect(() => {
    setDelivery(undefined);
    if (!selectedId) return;
    let current = true;
    adminApi.announcementDelivery(selectedId).then((result) => { if (current) setDelivery(result); }).catch(() => undefined);
    return () => { current = false; };
  }, [selectedId]);

  async function save(publish: boolean) {
    if (!draft.title.trim() || !draft.body.trim()) { toast.error("Title and message are required"); return; }
    if (draft.actionUrl.trim() && !draft.actionLabel.trim()) { toast.error("A link needs a button label"); return; }
    setBusy(true);
    try {
      const created = await adminApi.createAnnouncement({
        title: draft.title.trim(),
        body: draft.body.trim(),
        audience: draft.audience,
        sendEmail: draft.sendEmail,
        actionLabel: draft.actionLabel.trim() || null,
        actionUrl: draft.actionUrl.trim() || null,
        // datetime-local has no zone; the browser's own offset is the one the
        // operator was thinking in.
        publishAt: draft.publishAt ? new Date(draft.publishAt).toISOString() : null,
      });
      if (publish) await adminApi.publishAnnouncement(created.id);
      await refresh();
      setEditorOpen(false);
      setDraft(blank);
      toast.success(publish ? "Announcement published" : created.status === "scheduled" ? "Announcement scheduled" : "Draft saved");
    } catch (reason) {
      toast.error("Could not save", { description: reason instanceof Error ? reason.message : undefined });
    } finally { setBusy(false); }
  }

  async function publish(item: AdminAnnouncement) {
    try {
      const result = await adminApi.publishAnnouncement(item.id);
      await refresh();
      toast.success("Announcement published", {
        description: result.emailQueued ? "Email delivery is running; check the delivery panel for its outcome." : undefined,
      });
    } catch (reason) {
      toast.error("Could not publish", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  async function unpublish(item: AdminAnnouncement) {
    try {
      const result = await adminApi.unpublishAnnouncement(item.id);
      await refresh();
      // Being explicit rather than implying the message was undone.
      toast.success("Withdrawn from the app", {
        description: result.emailsAlreadySent
          ? `${result.emailsAlreadySent} email${result.emailsAlreadySent === 1 ? "" : "s"} had already been sent and cannot be recalled.`
          : undefined,
      });
    } catch (reason) {
      toast.error("Could not withdraw", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  async function remove(item: AdminAnnouncement) {
    try {
      await adminApi.deleteAnnouncement(item.id);
      setSelectedId(undefined);
      await refresh();
      toast.success("Announcement deleted");
    } catch (reason) {
      toast.error("Could not delete", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  const totalViews = rows.reduce((sum, item) => sum + item.views, 0);
  const totalClicks = rows.reduce((sum, item) => sum + item.clicks, 0);
  const emailsSent = rows.reduce((sum, item) => sum + item.emailsSent, 0);
  const emailsFailed = rows.reduce((sum, item) => sum + item.emailsFailed, 0);
  const nextScheduled = rows.filter((item) => item.status === "scheduled" && item.publishAt)
    .sort((a, b) => new Date(a.publishAt!).getTime() - new Date(b.publishAt!).getTime())[0];

  return <>
    <AdminPageHeader title="Announcements" description="Create targeted, multi-channel product messages, maintenance notices, and lifecycle communications." actions={<><AdminDataNotice source={source} error={error} /><AdminButton variant="primary" onClick={() => setEditorOpen(true)}><Plus />New announcement</AdminButton></>} />
    <div className="adm-stats"><Stat label="Published" value={rows.filter((item) => item.status === "published").length} change={`${rows.filter((item) => item.status === "draft").length} drafts`} detail="live in the app" icon={Megaphone} /><Stat label="Unique views" value={totalViews.toLocaleString()} change={`${rows.length} announcements`} detail="one per person" icon={Eye} /><Stat label="Click-through rate" value={totalViews ? `${(totalClicks / totalViews * 100).toFixed(1)}%` : "—"} change={totalViews ? `${totalClicks.toLocaleString()} clicks` : "no views yet"} detail="of people who saw one" icon={MousePointerClick} /><Stat label="Scheduled" value={rows.filter((item) => item.status === "scheduled").length} change={nextScheduled ? relativeTime(nextScheduled.publishAt!) : "—"} detail={nextScheduled ? "next to send" : "none queued"} icon={CalendarClock} /></div>
    <div className="adm-grid two">
      <div><div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search announcements, audience, or author…" /><select className="adm-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Any status</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option></select></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Announcement</th><th>Status</th><th>Audience</th><th>Channels</th><th>Author</th><th>Views</th><th>Publish time</th><th /></tr></thead><tbody>{pagination.rows.map((item) => <tr className="clickable" key={item.id} onClick={() => setSelectedId(item.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><Megaphone /></span><div className="adm-cell-copy"><b>{item.title}</b><small>{item.clicks} click{item.clicks === 1 ? "" : "s"}</small></div></div></td><td><StatusPill status={item.status} /></td><td>{AUDIENCE_LABEL[item.audience]}</td><td>{item.sendEmail ? "In-app + email" : "In-app"}</td><td>{item.authorName ?? "—"}</td><td>{item.views.toLocaleString()}</td><td>{item.publishedAt ? relativeTime(item.publishedAt) : item.publishAt ? `in ${relativeTime(item.publishAt)}` : "—"}</td><td><IconAction label="Open announcement" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}><MoreHorizontal /></IconAction></td></tr>)}{pagination.rows.length === 0 && <tr><td colSpan={8} className="adm-empty">{source === "loading" ? "Loading announcements…" : "No announcements yet."}</td></tr>}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div></div>
      <div className="adm-grid"><Panel title="Channel performance" description="Across every announcement"><div className="adm-check-row"><span className="flex gap-2 items-center"><Smartphone size={13} /><span><b>In-app</b><small>{totalViews.toLocaleString()} unique views</small></span></span><span>{totalViews ? `${(totalClicks / totalViews * 100).toFixed(1)}% clicked` : "—"}</span></div><div className="adm-check-row"><span className="flex gap-2 items-center"><Mail size={13} /><span><b>Email</b><small>{emailsSent.toLocaleString()} delivered</small></span></span><span className={emailsFailed ? "adm-stat-change down" : undefined}>{emailsFailed ? `${emailsFailed} failed` : emailsSent ? "all delivered" : "—"}</span></div><div className="adm-check-row"><span className="flex gap-2 items-center"><MessageSquare size={13} /><span><b>Status page</b><small>Published separately</small></span></span><span className="text-zinc-600">not linked</span></div></Panel><Panel title="Audience health" description={`Reachable contacts for ${AUDIENCE_LABEL[draft.audience]}`}><div className="adm-kpi-row"><span>In-app eligible</span><span>{reach ? `${reach.inApp.toLocaleString()} users` : "—"}</span></div><div className="adm-kpi-row"><span>Email opted in</span><span>{reach ? `${reach.email.toLocaleString()} contacts` : "—"}</span></div><div className="adm-kpi-row"><span>Opted out of email</span><span className={reach?.optedOut ? "adm-stat-change down" : undefined}>{reach ? `${reach.optedOut.toLocaleString()} contacts` : "—"}</span></div></Panel><Panel title="Delivery guardrails" description="Applies to every broadcast"><div className="adm-notice"><Users />Email goes out in paced batches so a large audience is not truncated by the provider rate limit, and every recipient outcome is recorded. In-app delivery follows the audience rule live, so a workspace that changes plan sees the right messages from that moment.</div></Panel></div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.title ?? "Announcement"} description={selected ? AUDIENCE_LABEL[selected.audience] : undefined} footer={selected && <><AdminButton variant="danger" onClick={() => void remove(selected)}><Trash2 />Delete</AdminButton>{selected.status === "published" ? <AdminButton onClick={() => void unpublish(selected)}><Pause />Withdraw</AdminButton> : <AdminButton variant="primary" onClick={() => void publish(selected)}><Send />Publish now</AdminButton>}</>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.status} /><StatusPill status="info" label={selected.sendEmail ? "In-app + email" : "In-app"} noDot /></div><DetailGrid items={[["Audience", AUDIENCE_LABEL[selected.audience]], ["Author", selected.authorName ?? "—"], ["Unique views", selected.views.toLocaleString()], ["Clicks", selected.clicks.toLocaleString()], ["CTR", selected.views ? `${(selected.clicks / selected.views * 100).toFixed(1)}%` : "—"], ["Published", selected.publishedAt ? new Date(selected.publishedAt).toLocaleString() : selected.publishAt ? `scheduled ${new Date(selected.publishAt).toLocaleString()}` : "Not published"]]} /><p className="adm-section-label">Customer preview</p><div className="border border-white/10 rounded-lg bg-[#0d1012] p-4"><div className="flex items-center gap-2"><span className="adm-logo-mark" style={{ width: 25, height: 25, transform: "none" }}><span /><span /><span /></span><div><b className="text-[9px]">Orbit update</b><p className="text-[7px] text-zinc-600">{AUDIENCE_LABEL[selected.audience]}</p></div></div><h3 className="text-sm mt-4">{selected.title}</h3><p className="text-[9px] leading-5 text-zinc-400 mt-2 whitespace-pre-wrap">{selected.body}</p>{selected.actionLabel && <button className="adm-button primary mt-4">{selected.actionLabel}</button>}</div><p className="adm-section-label">Delivery</p><div className="adm-kpi-row"><span>Unique views</span><span>{(delivery?.views ?? selected.views).toLocaleString()}</span></div><div className="adm-kpi-row"><span>Action clicks</span><span>{(delivery?.clicks ?? selected.clicks).toLocaleString()}</span></div>{selected.sendEmail && <><div className="adm-kpi-row"><span>Emails delivered</span><span>{(delivery?.emailsSent ?? selected.emailsSent).toLocaleString()}</span></div><div className="adm-kpi-row"><span>Emails failed</span><span className={(delivery?.emailsFailed ?? selected.emailsFailed) ? "adm-stat-change down" : undefined}>{(delivery?.emailsFailed ?? selected.emailsFailed).toLocaleString()}</span></div></>}{delivery && delivery.failures.length > 0 && <><p className="adm-section-label">Failed recipients</p><ul className="adm-list border border-white/10 rounded-md">{delivery.failures.map((failure, index) => <li className="adm-list-item" key={`${failure.email}-${index}`}><Mail /><div className="adm-list-copy"><b>{failure.email}</b><small>{failure.error ?? "No reason recorded"}</small></div></li>)}</ul></>}</>}
    </Drawer>

    <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title="Compose announcement" description="Preview and target a customer communication before publishing." large footer={<><AdminButton disabled={busy} onClick={() => void save(false)}>Save draft</AdminButton><AdminButton variant="primary" disabled={busy} onClick={() => void save(true)}><Send />Publish now</AdminButton></>}><div className="adm-form-grid"><div className="adm-field span-2"><label>Announcement title</label><input autoFocus className="adm-input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="What should customers know?" /></div><div className="adm-field"><label>Audience</label><select className="adm-select w-full" value={draft.audience} onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value as AnnouncementAudience }))}>{Object.entries(AUDIENCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="adm-field"><label>Channels</label><select className="adm-select w-full" value={draft.sendEmail ? "email" : "in-app"} onChange={(event) => setDraft((current) => ({ ...current, sendEmail: event.target.value === "email" }))}><option value="in-app">In-app only</option><option value="email">In-app + email</option></select></div><div className="adm-field span-2"><label>Message</label><textarea className="adm-textarea min-h-36" value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Write a concise, actionable customer message…" /></div><div className="adm-field"><label>Button label (optional)</label><input className="adm-input" value={draft.actionLabel} onChange={(event) => setDraft((current) => ({ ...current, actionLabel: event.target.value }))} placeholder="Learn more" /></div><div className="adm-field"><label>Button link (optional)</label><input className="adm-input" value={draft.actionUrl} onChange={(event) => setDraft((current) => ({ ...current, actionUrl: event.target.value }))} placeholder="https://…" /></div><div className="adm-field span-2"><label>Schedule (optional)</label><input className="adm-input" type="datetime-local" value={draft.publishAt} onChange={(event) => setDraft((current) => ({ ...current, publishAt: event.target.value }))} /></div></div><div className="adm-notice mt-4"><Eye />{reach ? <>Reaches {reach.inApp.toLocaleString()} {reach.inApp === 1 ? "person" : "people"} in-app{draft.sendEmail ? `, and ${reach.email.toLocaleString()} by email — ${reach.optedOut.toLocaleString()} have opted out` : ""}.</> : "Calculating the reachable audience…"}</div></Modal>
  </>;
}

export default AnnouncementsAdminPage;
