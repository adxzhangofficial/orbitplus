import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Headphones, Inbox, LifeBuoy, MessageSquareReply, MoreHorizontal, Plus, Send, Timer, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { supportTickets, type SupportTicket } from "./_data";
import { adminApi, AdminDataNotice, toPageTicket, useAdminResource, type AdminCustomer, type AdminOperator, type AdminSupportMetrics, type AdminTicketDetail } from "./_api";
import { AdminButton, AdminPageHeader, Avatar, DetailGrid, Drawer, IconAction, Modal, Pagination, Panel, SearchBox, Stat, StatusPill, usePagination } from "./_shared";

/**
 * The operator queue, backed by the support tables.
 *
 * The conversation shown in the drawer is the real thread, loaded when a ticket
 * is opened rather than kept in the list — a queue of a hundred tickets should
 * not carry every message with it.
 *
 * Figures that have nothing behind them yet read as "—" instead of a plausible
 * number. An empty support desk should look empty.
 */

const emptyDraft = { organizationId: "", subject: "", body: "", priority: "normal" };

function minutes(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${value} min`;
  return `${(value / 60).toFixed(1)} h`;
}

export function SupportAdminPage() {
  const { data: rows, source, error, refresh } = useAdminResource<SupportTicket[]>(
    "admin.support",
    supportTickets,
    async () => (await adminApi.tickets()).map(toPageTicket),
  );
  const [metrics, setMetrics] = useState<AdminSupportMetrics>();
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [organizations, setOrganizations] = useState<AdminCustomer[]>([]);
  const [thread, setThread] = useState<AdminTicketDetail>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const selected = rows.find((ticket) => ticket.id === selectedId);
  const filtered = useMemo(() => rows.filter((ticket) => `${ticket.id} ${ticket.subject} ${ticket.customer} ${ticket.assignee}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || ticket.status === status) && (priority === "all" || ticket.priority === priority)), [priority, query, rows, status]);
  const pagination = usePagination(filtered, 7);

  const reload = useCallback(async () => {
    await refresh();
    adminApi.supportMetrics().then(setMetrics).catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (source !== "live") return;
    adminApi.supportMetrics().then(setMetrics).catch(() => undefined);
    adminApi.operators().then(setOperators).catch(() => undefined);
    adminApi.customers().then(setOrganizations).catch(() => undefined);
  }, [source]);

  // The thread belongs to whichever ticket is open, so it is cleared first —
  // otherwise the previous customer's messages show under the new subject for
  // as long as the fetch takes.
  useEffect(() => {
    setThread(undefined);
    setReply("");
    if (!selectedId) return;
    let current = true;
    adminApi.ticket(selectedId).then((detail) => { if (current) setThread(detail); }).catch(() => undefined);
    return () => { current = false; };
  }, [selectedId]);

  async function patch(id: string, values: { assignedTo?: string | null; priority?: string; status?: string }, message?: string) {
    try {
      await adminApi.updateTicket(id, values);
      await reload();
      if (message) toast.success(message);
    } catch (reason) {
      toast.error("Could not update the ticket", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  async function sendReply(internal = false) {
    if (!selected || !reply.trim()) { toast.error(internal ? "Write a note first" : "Write a reply first"); return; }
    setSending(true);
    try {
      await adminApi.replyToTicket(selected.id, reply.trim(), { internal });
      setReply("");
      const [detail] = await Promise.all([adminApi.ticket(selected.id), reload()]);
      setThread(detail);
      toast.success(internal ? "Internal note added" : "Reply sent to customer");
    } catch (reason) {
      toast.error("Could not send", { description: reason instanceof Error ? reason.message : undefined });
    } finally { setSending(false); }
  }

  async function createTicket() {
    if (!draft.organizationId || draft.subject.trim().length < 3 || !draft.body.trim()) {
      toast.error("Pick a customer, and write a subject and a first message");
      return;
    }
    try {
      await adminApi.createTicket({ ...draft, subject: draft.subject.trim(), body: draft.body.trim() });
      await reload();
      setNewOpen(false);
      setDraft(emptyDraft);
      toast.success("Support ticket created");
    } catch (reason) {
      toast.error("Could not create the ticket", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  // Open and pending work, grouped by who owns it.
  const load = useMemo(() => {
    const tally = new Map<string, number>();
    for (const ticket of rows) {
      if (ticket.status === "closed") continue;
      tally.set(ticket.assignee, (tally.get(ticket.assignee) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return <>
    <AdminPageHeader title="Support desk" description="Manage customer conversations, enterprise SLAs, ownership, and technical escalation from one operator queue." actions={<><AdminDataNotice source={source} error={error} /><AdminButton onClick={() => void reload().then(() => toast.success("Support queue synchronized"))}><Inbox />Sync inbox</AdminButton><AdminButton variant="primary" onClick={() => setNewOpen(true)}><Plus />New ticket</AdminButton></>} />
    <div className="adm-stats"><Stat label="Open tickets" value={metrics?.open ?? rows.filter((ticket) => ticket.status === "open").length} change={`${metrics?.pending ?? 0} pending`} detail="awaiting a first reply" icon={Headphones} /><Stat label="First response" value={minutes(metrics?.medianFirstResponseMinutes ?? null)} change={metrics?.sampleSize ? `${metrics.sampleSize} tickets` : "no data"} detail="median, last 30 days" icon={Clock3} /><Stat label="SLA attainment" value={metrics?.slaAttainmentPercent === null || metrics?.slaAttainmentPercent === undefined ? "—" : `${metrics.slaAttainmentPercent}%`} change="first response" detail="against target, 30 days" icon={Timer} /><Stat label="Resolved this week" value={metrics?.week.resolved ?? 0} change={`${metrics?.week.reopened ?? 0} reopened`} detail={`${metrics?.week.escalated ?? 0} escalated`} icon={LifeBuoy} /></div>
    <div className="adm-grid two">
      <div><div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search ticket, customer, or assignee…" /><select className="adm-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Any status</option><option value="open">Open</option><option value="pending">Pending</option><option value="closed">Closed</option></select><select className="adm-select" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Any priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Conversation</th><th>Priority</th><th>Status</th><th>Customer</th><th>Plan</th><th>Assignee</th><th>SLA / updated</th><th /></tr></thead><tbody>{pagination.rows.map((ticket) => <tr className="clickable" key={ticket.id} onClick={() => setSelectedId(ticket.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><MessageSquareReply /></span><div className="adm-cell-copy"><b>{ticket.subject}</b><small>{ticket.messages} message{ticket.messages === 1 ? "" : "s"} · {ticket.channel}</small></div></div></td><td><StatusPill status={ticket.priority} /></td><td><StatusPill status={ticket.status} /></td><td>{ticket.customer}</td><td><StatusPill status={ticket.plan === "Enterprise" ? "lime" : ticket.plan === "Pro" ? "info" : "neutral"} label={ticket.plan} noDot /></td><td>{ticket.assignee}</td><td><div className="adm-cell-copy"><b className={ticket.slaBreached || (ticket.slaMinutes && ticket.slaMinutes < 30) ? "text-red-400" : undefined}>{ticket.slaBreached ? "Overdue" : ticket.slaMinutes ? `${ticket.slaMinutes}m left` : "Met"}</b><small>{relativeTime(ticket.updatedAt)}</small></div></td><td><IconAction label="Open ticket" onClick={(event) => { event.stopPropagation(); setSelectedId(ticket.id); }}><MoreHorizontal /></IconAction></td></tr>)}{pagination.rows.length === 0 && <tr><td colSpan={8} className="adm-empty">{source === "loading" ? "Loading the queue…" : "No tickets match this view."}</td></tr>}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div></div>
      <div className="adm-grid"><Panel title="SLA watch" description="Tickets nearest to breach" bodyClassName="flush"><ul className="adm-list">{rows.filter((ticket) => ticket.status !== "closed" && !ticket.slaBreached && ticket.slaMinutes > 0).sort((a, b) => a.slaMinutes - b.slaMinutes).slice(0, 3).map((ticket) => <li className="adm-list-item" key={ticket.id}><Timer /><div className="adm-list-copy"><b>{ticket.customer}</b><small>{ticket.subject}</small></div><div className="adm-list-meta"><b className={ticket.slaMinutes < 30 ? "text-red-400" : ""}>{ticket.slaMinutes}m</b><small>{ticket.priority}</small></div></li>)}{rows.filter((ticket) => ticket.status !== "closed" && !ticket.slaBreached && ticket.slaMinutes > 0).length === 0 && <li className="adm-list-item"><Timer /><div className="adm-list-copy"><b>Nothing pending</b><small>No ticket is waiting on a first response.</small></div></li>}</ul></Panel><Panel title="Team load" description="Open and pending conversations">{load.map(([assignee, count]) => <div className="adm-kpi-row" key={assignee}><span>{assignee}</span><span className={assignee === "Unassigned" ? "adm-stat-change down" : undefined}>{count} ticket{count === 1 ? "" : "s"}</span></div>)}{load.length === 0 && <div className="adm-kpi-row"><span>No open conversations</span><span>0 tickets</span></div>}</Panel><Panel title="Support performance" description="This week"><div className="adm-metric-grid"><div className="adm-metric-box"><span>Resolved</span><b>{metrics?.week.resolved ?? 0}</b><small>last 7 days</small></div><div className="adm-metric-box"><span>Reopened</span><b>{metrics?.week.reopened ?? 0}</b><small>{metrics?.week.resolved ? `${Math.round((metrics.week.reopened / metrics.week.resolved) * 100)}% rate` : "no rate yet"}</small></div><div className="adm-metric-box"><span>Escalated</span><b>{metrics?.week.escalated ?? 0}</b><small>priority raised</small></div></div></Panel></div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.subject ?? "Support ticket"} description={selected ? selected.customer : undefined} footer={selected && <><AdminButton onClick={() => void patch(selected.id, { status: selected.status === "closed" ? "open" : "resolved" }, selected.status === "closed" ? "Ticket reopened" : "Ticket resolved")}><CheckCircle2 />{selected.status === "closed" ? "Reopen" : "Resolve"}</AdminButton><AdminButton variant="primary" disabled={sending} onClick={() => void sendReply(false)}><Send />{sending ? "Sending…" : "Send reply"}</AdminButton></>}>
      {selected && <><div className="flex items-center gap-2 mb-4"><StatusPill status={selected.priority} /><StatusPill status={selected.status} /><StatusPill status={selected.plan === "Enterprise" ? "lime" : "info"} label={selected.plan} noDot /></div><DetailGrid items={[["Customer", selected.customer], ["Channel", selected.channel], ["Assignee", selected.assignee], ["SLA remaining", selected.slaBreached ? "Overdue" : selected.slaMinutes ? `${selected.slaMinutes} minutes` : "Met"], ["Messages", selected.messages], ["Last update", relativeTime(selected.updatedAt)]]} /><p className="adm-section-label">Priority</p><select className="adm-select w-full" value={selected.priority} onChange={(event) => void patch(selected.id, { priority: event.target.value }, `Priority set to ${event.target.value}`)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select><p className="adm-section-label">Conversation</p><div className="adm-list border border-white/10 rounded-md">{thread ? thread.messages.map((message) => <div className={`adm-list-item items-start${message.authorRole === "internal" ? " opacity-70" : ""}`} key={message.id}><Avatar name={message.authorName ?? (message.authorRole === "customer" ? selected.customer : "Orbit Support")} /><div className="adm-list-copy"><b>{message.authorName ?? (message.authorRole === "customer" ? selected.customer : "Orbit Support")}{message.authorRole === "internal" ? " · internal note" : ""}</b><small className="leading-4 mt-2 whitespace-pre-wrap">{message.body}</small><small className="mt-1 text-zinc-600">{relativeTime(message.createdAt)}</small></div></div>) : <div className="adm-list-item"><div className="adm-list-copy"><small>Loading the conversation…</small></div></div>}{thread && thread.messages.length === 0 && <div className="adm-list-item"><div className="adm-list-copy"><small>No messages on this ticket yet.</small></div></div>}</div><p className="adm-section-label">Assignment</p><select className="adm-select w-full" value={selected.assignedToId ?? ""} onChange={(event) => void patch(selected.id, { assignedTo: event.target.value || null }, event.target.value ? `Assigned to ${operators.find((operator) => operator.id === event.target.value)?.name ?? "operator"}` : "Assignment cleared")}><option value="">Unassigned</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select><p className="adm-section-label">Reply</p><textarea className="adm-textarea" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a customer-facing response…" /><div className="flex items-center justify-between mt-2"><span className="text-[7px] text-zinc-600">The customer sees this in their support view.</span><AdminButton size="small" variant="ghost" disabled={sending} onClick={() => void sendReply(true)}>Add internal note</AdminButton></div></>}
    </Drawer>

    <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Create support ticket" description="Open a conversation on behalf of a customer." footer={<><AdminButton onClick={() => setNewOpen(false)}>Cancel</AdminButton><AdminButton variant="primary" onClick={() => void createTicket()}><UserCheck />Create ticket</AdminButton></>}><div className="adm-form-grid"><div className="adm-field"><label>Customer</label><select className="adm-select w-full" value={draft.organizationId} onChange={(event) => setDraft((current) => ({ ...current, organizationId: event.target.value }))}><option value="">Select a customer…</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div><div className="adm-field"><label>Priority</label><select className="adm-select w-full" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div><div className="adm-field span-2"><label>Subject</label><input className="adm-input" autoFocus placeholder="Brief summary" value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} /></div><div className="adm-field span-2"><label>Initial message</label><textarea className="adm-textarea" placeholder="Describe the customer issue…" value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></div></div></Modal>
  </>;
}

export default SupportAdminPage;
