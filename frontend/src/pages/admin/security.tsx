import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Fingerprint, Globe2, LockKeyhole, MoreHorizontal, Radar, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { auditEvents } from "./_data";
import { AdminDataNotice, adminApi, type AdminAuditEvent, type AdminOverview, unsupported, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Pagination, Panel, SearchBox, Stat, StatusPill, usePagination } from "./_shared";

interface SecurityData { overview: AdminOverview; activity: AdminAuditEvent[] }
const fallback: SecurityData = {
  overview: { counts: { users: 1284, organizations: 142, servers: 319, activeTransfers: 18, criticalAlerts: 2, suspendedOrganizations: 3 }, revenue: { monthlyRecurringCents: 32_400_00, free: 54, pro: 68, enterprise: 20 }, growth: [], infrastructure: { online: 302, offline: 9, unknown: 8 }, recentCustomers: [] },
  activity: auditEvents.map((event) => ({ id: event.id, actor: event.actor, action: event.action, organization: event.organization, resourceType: event.category, resourceId: event.target, requestId: event.requestId, ipAddress: event.ip, metadata: event.metadata, createdAt: event.createdAt })),
};

async function loadSecurity(): Promise<SecurityData> {
  const [overview, activity] = await Promise.all([adminApi.overview(), adminApi.activity()]);
  return { overview, activity };
}

function looksSecurityRelated(event: AdminAuditEvent) {
  return /auth|login|security|credential|secret|token|session|suspend|permission|role|fingerprint|host.key/i.test(`${event.action} ${event.resourceType} ${JSON.stringify(event.metadata ?? {})}`);
}

export function SecurityAdminPage() {
  const resource = useAdminResource("admin-security", fallback, loadSecurity);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const securityEvents = useMemo(() => resource.data.activity.filter(looksSecurityRelated), [resource.data.activity]);
  const filtered = useMemo(() => securityEvents.filter((event) => JSON.stringify(event).toLowerCase().includes(query.toLowerCase())), [query, securityEvents]);
  const pagination = usePagination(filtered, 8);
  const selected = securityEvents.find((event) => event.id === selectedId);

  return <>
    <AdminPageHeader title="Security center" description="Live critical-alert counts and security-related audit evidence from the platform admin APIs." actions={<><AdminButton onClick={() => unsupported("Threat-feed refresh")}><Radar />Refresh feeds <small>API required</small></AdminButton><AdminButton variant="danger" onClick={() => unsupported("Global login challenge")}><LockKeyhole />Challenge logins <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Critical alerts" value={resource.data.overview.counts.criticalAlerts} detail="open alert records" icon={ShieldAlert} /><Stat label="Security events loaded" value={securityEvents.length} detail="classified from audit actions" icon={AlertTriangle} /><Stat label="Suspended tenants" value={resource.data.overview.counts.suspendedOrganizations} detail="access restricted" icon={Ban} /><Stat label="Unknown endpoints" value={resource.data.overview.infrastructure.unknown} detail="unknown or degraded state" icon={ShieldCheck} /></div>

    <div className="adm-grid two"><div><div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search security action, actor, tenant, or IP…" /></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Security event</th><th>Actor</th><th>Organization</th><th>Resource</th><th>Source</th><th>Detected</th><th /></tr></thead><tbody>{pagination.rows.map((event) => <tr className="clickable" key={event.id} onClick={() => setSelectedId(event.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><ShieldAlert /></span><div className="adm-cell-copy"><b>{event.action}</b><small className="adm-mono">{event.requestId ?? event.id}</small></div></div></td><td>{event.actor ?? "System"}</td><td>{event.organization ?? "Platform"}</td><td><StatusPill status="neutral" label={event.resourceType} noDot /></td><td className="adm-mono">{event.ipAddress ?? "System"}</td><td>{relativeTime(event.createdAt)}</td><td><IconAction label="Inspect security event" onClick={(click) => { click.stopPropagation(); setSelectedId(event.id); }}><MoreHorizontal /></IconAction></td></tr>)}{!pagination.rows.length && <tr><td colSpan={7}><div className="adm-empty"><div><ShieldCheck /><b>No matching security events</b><p>The current audit page contains no records matching the security classifier.</p></div></div></td></tr>}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div></div>
      <div className="adm-grid"><Panel title="Platform posture" description="Direct overview API signals"><div className="adm-kpi-row"><span>Online endpoints</span><span>{resource.data.overview.infrastructure.online}</span></div><div className="adm-kpi-row"><span>Offline endpoints</span><span>{resource.data.overview.infrastructure.offline}</span></div><div className="adm-kpi-row"><span>Critical alert records</span><span>{resource.data.overview.counts.criticalAlerts}</span></div><div className="adm-kpi-row"><span>Suspended organizations</span><span>{resource.data.overview.counts.suspendedOrganizations}</span></div></Panel><Panel title="Security API coverage" description="Current operational boundary"><div className="adm-notice"><ShieldCheck />The backend exposes alert counts and immutable activity, but not a platform incident mutation API. Event rows are audit records classified by action/resource text; they are not presented as incident tickets.</div><div className="adm-grid equal mt-3"><AdminButton onClick={() => unsupported("Network deny-list mutation")}><Globe2 />Block network <small>Unsupported</small></AdminButton><AdminButton onClick={() => unsupported("Cross-tenant session revocation")}><UserX />Revoke sessions <small>Unsupported</small></AdminButton></div></Panel></div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.action ?? "Security event"} description={selected?.requestId ?? selected?.id} footer={selected && <><AdminButton onClick={() => unsupported("Security incident escalation")}>Escalate <small>Unsupported</small></AdminButton><AdminButton variant="primary" onClick={() => unsupported("Security incident resolution")}>Resolve <small>Unsupported</small></AdminButton></>}>
      {selected && <><div className="flex items-center gap-2 mb-4"><StatusPill status="warning" label="Security-related audit event" /></div><DetailGrid items={[["Organization", selected.organization ?? "Platform"], ["Actor", selected.actor ?? "System"], ["Resource type", selected.resourceType], ["Resource ID", selected.resourceId ?? "Not recorded"], ["Source IP", selected.ipAddress ?? "System"], ["Recorded", new Date(selected.createdAt).toLocaleString()]]} /><p className="adm-section-label">Recorded metadata</p><pre className="adm-code">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre><div className="adm-notice mt-3"><Fingerprint />This is evidence from the audit stream. Incident status, severity, assignment, containment, and resolution require a dedicated server-side incident model.</div></>}
    </Drawer>
  </>;
}

export default SecurityAdminPage;
