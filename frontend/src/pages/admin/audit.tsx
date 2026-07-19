import { useMemo, useState } from "react";
import { Copy, Download, FileClock, Fingerprint, KeyRound, MoreHorizontal, SearchCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { auditEvents } from "./_data";
import { AdminDataNotice, adminApi, type AdminAuditEvent, unsupported, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Pagination, Panel, SearchBox, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

const fallbackEvents: AdminAuditEvent[] = auditEvents.map((event) => ({ id: event.id, actor: event.actor, action: event.action, organization: event.organization, resourceType: event.category, resourceId: event.target, requestId: event.requestId, ipAddress: event.ip, metadata: event.metadata, createdAt: event.createdAt }));

export function AuditAdminPage() {
  const resource = useAdminResource("admin-audit", fallbackEvents, adminApi.activity);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const selected = resource.data.find((event) => event.id === selectedId);
  const filtered = useMemo(() => resource.data.filter((event) => JSON.stringify(event).toLowerCase().includes(query.toLowerCase()) && (category === "all" || event.resourceType === category)), [category, query, resource.data]);
  const pagination = usePagination(filtered, 8);
  const organizations = new Set(resource.data.map((event) => event.organizationId).filter(Boolean)).size;
  const actors = new Set(resource.data.map((event) => event.actor).filter(Boolean)).size;

  function exportLog() {
    downloadCsv("orbit-audit-log.csv", filtered.map(({ id, actor, action, resourceType, resourceId, organization, organizationId, ipAddress, createdAt, requestId }) => ({ id, actor: actor ?? "System", action, resourceType, resourceId: resourceId ?? "", organization: organization ?? "Platform", organizationId: organizationId ?? "", ipAddress: ipAddress ?? "", createdAt, requestId: requestId ?? "" })));
    toast.success(`${filtered.length} audit events exported`);
  }

  return <>
    <AdminPageHeader title="Audit log" description="Searchable evidence of customer, system, and administrator activity returned by the live audit API." actions={<><AdminButton onClick={() => unsupported("Server-side audit-chain verification")}><SearchCheck />Verify chain <small>API required</small></AdminButton><AdminButton variant="primary" onClick={exportLog}><Download />Export loaded evidence</AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Events loaded" value={resource.data.length} detail="latest API page" icon={FileClock} /><Stat label="Resource categories" value={new Set(resource.data.map((event) => event.resourceType)).size} detail="in loaded records" icon={KeyRound} /><Stat label="Organizations" value={organizations} detail="represented in page" icon={ShieldCheck} /><Stat label="Actors" value={actors} detail="identified principals" icon={Fingerprint} /></div>

    <div className="adm-grid two"><div><div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search actor, action, resource, request ID, or IP…" /><select className="adm-select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Any category</option>{[...new Set(resource.data.map((event) => event.resourceType))].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Event</th><th>Actor</th><th>Organization</th><th>Resource</th><th>IP / source</th><th>Time</th><th /></tr></thead><tbody>{pagination.rows.map((event) => <tr className="clickable" key={event.id} onClick={() => setSelectedId(event.id)}><td><div className="adm-cell-copy"><b>{event.action}</b><small className="adm-mono">{event.requestId ?? event.id}</small></div></td><td>{event.actor ?? "System"}</td><td>{event.organization ?? "Platform"}</td><td><StatusPill status="neutral" label={event.resourceType} noDot /></td><td className="adm-mono">{event.ipAddress ?? "System"}</td><td>{relativeTime(event.createdAt)}</td><td><IconAction label="Inspect audit event" onClick={(click) => { click.stopPropagation(); setSelectedId(event.id); }}><MoreHorizontal /></IconAction></td></tr>)}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div></div>
      <div className="adm-grid"><Panel title="Evidence coverage" description="Fields returned by the platform activity endpoint"><div className="adm-kpi-row"><span>Actor and tenant context</span><StatusPill status="active" label="Available" /></div><div className="adm-kpi-row"><span>Request and IP context</span><StatusPill status="active" label="Available" /></div><div className="adm-kpi-row"><span>Structured metadata</span><StatusPill status="active" label="Available" /></div><div className="adm-kpi-row"><span>Cryptographic inclusion proof</span><StatusPill status="neutral" label="Not exposed" noDot /></div></Panel><Panel title="Saved evidence views" description="Operator filters"><button className="adm-check-row w-full text-left" onClick={() => setCategory("organization")}><span><b>Organization lifecycle</b><small>resourceType = organization</small></span><SearchCheck size={13} /></button><button className="adm-check-row w-full text-left" onClick={() => setQuery("auth")}><span><b>Authentication activity</b><small>Action contains auth</small></span><SearchCheck size={13} /></button></Panel></div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.action ?? "Audit event"} description={selected?.requestId ?? selected?.id} footer={selected && <><AdminButton onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(selected, null, 2)); toast.success("Event JSON copied"); }}><Copy />Copy JSON</AdminButton><AdminButton variant="primary" onClick={() => unsupported("Server-generated evidence bundle") }><Download />Evidence bundle <small>Unsupported</small></AdminButton></>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status="info" label="Persisted event" /><StatusPill status={resource.source === "live" ? "active" : "neutral"} label={resource.source === "live" ? "Live API" : "Demo"} /></div><DetailGrid items={[["Actor", selected.actor ?? "System"], ["Organization", selected.organization ?? "Platform"], ["Resource type", selected.resourceType], ["Resource ID", selected.resourceId ?? "Not recorded"], ["Source IP", selected.ipAddress ?? "System"], ["Occurred", new Date(selected.createdAt).toLocaleString()]]} /><p className="adm-section-label">Request context</p><pre className="adm-code">{JSON.stringify({ eventId: selected.id, requestId: selected.requestId, ...selected.metadata, recordedAt: selected.createdAt }, null, 2)}</pre><div className="adm-notice mt-3"><Fingerprint />This payload is returned by the audit API. Cryptographic chain proofs and server-side verification are not exposed, so the UI does not claim they were verified.</div></>}
    </Drawer>
  </>;
}

export default AuditAdminPage;
