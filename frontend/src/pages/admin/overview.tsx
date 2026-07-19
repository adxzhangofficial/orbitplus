import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Building2, CircleDollarSign, Clock3, Cloud, DatabaseBackup, Radio, RefreshCw, Server, ShieldCheck, Users, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatNumber, relativeTime } from "@/lib/utils";
import { AdminDataNotice, adminApi, type AdminAuditEvent, type AdminOverview, type AdminSystem, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, BarChart, Panel, Stat, StatusPill, formatCurrency } from "./_shared";

const fallbackOverview: AdminOverview = {
  counts: { users: 1284, organizations: 142, servers: 319, activeTransfers: 18, criticalAlerts: 2, suspendedOrganizations: 3 },
  revenue: { monthlyRecurringCents: 32_400_00, free: 54, pro: 68, enterprise: 20 },
  growth: [12, 15, 18, 21, 24, 29, 34, 39, 46, 55, 66, 78].map((organizations, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, organizations })),
  infrastructure: { online: 302, offline: 9, unknown: 8 },
  recentCustomers: [],
};

const fallbackSystem: AdminSystem = {
  api: { status: "healthy", uptimeSeconds: 821_422, memory: { rss: 384_000_000, heapTotal: 180_000_000, heapUsed: 112_000_000 }, nodeVersion: "v22" },
  database: { database: "orbit", version: "PostgreSQL", sizeBytes: 2_800_000_000, serverTime: new Date().toISOString(), latencyMs: 4 },
  queue: { failedTransfers: 1, runningTransfers: 18 }, tables: [], migrations: [],
};

const fallbackActivity: AdminAuditEvent[] = [
  { id: "demo-1", actor: "Platform Admin", action: "organization.plan.updated", organization: "Northstar Labs", resourceType: "organization", resourceId: "org_demo", ipAddress: "System", createdAt: new Date(Date.now() - 180_000).toISOString() },
  { id: "demo-2", actor: "Backup Worker", action: "backup.completed", organization: "Acme Engineering", resourceType: "backup", resourceId: "b_demo", ipAddress: "System", createdAt: new Date(Date.now() - 840_000).toISOString() },
];

export function OverviewAdminPage() {
  const navigate = useNavigate();
  const overview = useAdminResource("admin-overview", fallbackOverview, adminApi.overview);
  const activity = useAdminResource("admin-overview-activity", fallbackActivity, adminApi.activity);
  const system = useAdminResource("admin-overview-system", fallbackSystem, adminApi.system);
  const [refreshing, setRefreshing] = useState(false);
  const totalFleet = overview.data.infrastructure.online + overview.data.infrastructure.offline + overview.data.infrastructure.unknown;
  const growth = useMemo(() => overview.data.growth.map((point) => point.organizations), [overview.data.growth]);
  const planTotal = Math.max(overview.data.revenue.free + overview.data.revenue.pro + overview.data.revenue.enterprise, 1);

  async function refresh() {
    setRefreshing(true);
    const [result] = await Promise.all([overview.refresh(), activity.refresh(), system.refresh()]);
    setRefreshing(false);
    if (result === "live") toast.success("Admin API metrics refreshed");
    else if (result === "demo") toast.message("Demo dashboard refreshed locally", { description: "Sign in as a platform administrator for live data." });
    else toast.error("The live admin API could not be refreshed", { description: "Labeled demo data remains visible." });
  }

  return <>
    <AdminPageHeader title="Platform command center" description="A live operating view across tenant health, infrastructure, commercial performance, and trust signals." actions={<><AdminButton onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : undefined} />{refreshing ? "Refreshing" : "Refresh data"}</AdminButton><AdminButton variant="primary" onClick={() => navigate("/admin/organizations")}><Building2 />Open customer ledger</AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={overview.source} error={overview.error} /></div>

    <div className="adm-stats">
      <Stat label="Monthly recurring revenue" value={formatCurrency(overview.data.revenue.monthlyRecurringCents / 100)} detail="active and trialing subscriptions" icon={CircleDollarSign} data={growth.length > 1 ? growth : [0, overview.data.counts.organizations]} />
      <Stat label="Organizations" value={overview.data.counts.organizations.toLocaleString()} change={`${overview.data.counts.suspendedOrganizations} suspended`} detail={`${overview.data.counts.users.toLocaleString()} identities`} icon={Building2} data={growth.length ? growth : undefined} />
      <Stat label="Connected fleet" value={`${overview.data.infrastructure.online}/${totalFleet || overview.data.counts.servers}`} detail={`${overview.data.infrastructure.offline} offline · ${overview.data.infrastructure.unknown} unknown`} icon={Server} />
      <Stat label="Jobs in flight" value={overview.data.counts.activeTransfers} change={overview.data.counts.criticalAlerts ? `${overview.data.counts.criticalAlerts} critical` : "No critical alerts"} detail="active transfers" icon={Zap} />
    </div>

    <div className="adm-grid two">
      <Panel title="Organization growth" description="New customer organizations recorded by the control plane" action={<StatusPill status={overview.source === "live" ? "active" : "neutral"} label={overview.source === "live" ? "Live PostgreSQL" : "Demo series"} />}>
        <BarChart values={growth.length ? growth : [0]} labels={overview.data.growth.map((point) => new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }))} />
        <div className="adm-metric-grid"><div className="adm-metric-box"><span>Customers</span><b>{overview.data.counts.organizations.toLocaleString()}</b><small>Total tenants</small></div><div className="adm-metric-box"><span>Users</span><b>{overview.data.counts.users.toLocaleString()}</b><small>All identities</small></div><div className="adm-metric-box"><span>Servers</span><b>{overview.data.counts.servers.toLocaleString()}</b><small>Registered endpoints</small></div></div>
      </Panel>

      <Panel title="Service health" description="Current API, database, and queue signals" action={<StatusPill status={system.data.api.status === "healthy" ? "healthy" : "warning"} label={system.data.api.status} />}>
        <div className="adm-health-grid"><div className="adm-health-item"><div><b>API process</b><i /></div><small>{Math.floor(system.data.api.uptimeSeconds / 3600)}h uptime</small></div><div className="adm-health-item"><div><b>PostgreSQL</b><i /></div><small>{system.data.database.latencyMs} ms</small></div><div className="adm-health-item"><div><b>Transfers</b><i /></div><small>{system.data.queue.runningTransfers} running</small></div><div className="adm-health-item"><div><b>Runtime</b><i /></div><small>{system.data.api.nodeVersion}</small></div></div>
        <p className="adm-section-label">Operating signals</p>
        <div className="adm-kpi-row"><span>Critical alerts</span><span><StatusPill status={overview.data.counts.criticalAlerts ? "warning" : "active"} label={`${overview.data.counts.criticalAlerts} open`} /></span></div>
        <div className="adm-kpi-row"><span>Failed transfers · 24h</span><span>{system.data.queue.failedTransfers}</span></div>
        <div className="adm-kpi-row"><span>Database</span><span className="adm-mono">{system.data.database.database}</span></div>
        <div className="adm-kpi-row"><span>Heap used</span><span>{Math.round(system.data.api.memory.heapUsed / 1_048_576)} MB</span></div>
      </Panel>
    </div>

    <div className="adm-grid two">
      <Panel title="Live platform activity" description="Latest immutable events across every organization" action={<AdminButton size="small" variant="ghost" onClick={() => navigate("/admin/audit")}>Full audit log <ArrowUpRight /></AdminButton>} bodyClassName="flush">
        <ul className="adm-list">{activity.data.slice(0, 6).map((event) => <li className="adm-list-item" key={event.id}><span className="adm-cell-icon">{(event.actor ?? "SY").slice(0, 2).toUpperCase()}</span><div className="adm-list-copy"><b>{event.actor ?? "System"} · {event.action}</b><small>{event.organization ?? "Platform"} / {event.resourceType}{event.resourceId ? ` · ${event.resourceId}` : ""}</small></div><span className="adm-list-meta">{relativeTime(event.createdAt)}</span></li>)}</ul>
      </Panel>
      <div className="adm-grid">
        <Panel title="Plan mix" description="Current organization distribution">{(["enterprise", "pro", "free"] as const).map((plan) => { const count = overview.data.revenue[plan]; return <div className="adm-kpi-row" key={plan}><span className="capitalize">{plan}<small> · {count} orgs</small></span><div style={{ width: "45%" }} className="adm-progress"><i style={{ width: `${count / planTotal * 100}%` }} /></div><span>{Math.round(count / planTotal * 100)}%</span></div>; })}</Panel>
        <Panel title="Operator shortcuts" description="High-frequency control-plane views"><div className="adm-grid equal"><AdminButton onClick={() => navigate("/admin/jobs")}><Activity />Inspect queues</AdminButton><AdminButton onClick={() => navigate("/admin/backups")}><DatabaseBackup />Backup coverage</AdminButton><AdminButton onClick={() => navigate("/admin/security")}><ShieldCheck />Review incidents</AdminButton><AdminButton onClick={() => navigate("/admin/users")}><Users />Manage access</AdminButton></div></Panel>
      </div>
    </div>

    <Panel title="Capacity at a glance" description="Current production utilization from live control-plane counts" className="mt-3.5"><div className="adm-metric-grid"><div className="adm-metric-box"><span><Cloud /> Online endpoints</span><b>{formatNumber(overview.data.infrastructure.online)}</b><small>{overview.data.infrastructure.offline} currently offline</small></div><div className="adm-metric-box"><span><Radio /> Audit records loaded</span><b>{activity.data.length.toLocaleString()}</b><small>Latest API page</small></div><div className="adm-metric-box"><span><Clock3 /> API uptime</span><b>{Math.floor(system.data.api.uptimeSeconds / 3600)}h</b><small>Current process lifetime</small></div></div></Panel>
  </>;
}

export default OverviewAdminPage;
