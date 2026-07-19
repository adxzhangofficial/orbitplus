import { useState } from "react";
import { Activity, Braces, CloudCog, Database, RefreshCw, Save, ServerCog, Settings2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, relativeTime } from "@/lib/utils";
import { AdminDataNotice, adminApi, type AdminSystem, unsupported, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, Panel, Segments, Stat, StatusPill } from "./_shared";

const fallback: AdminSystem = {
  api: { status: "healthy", uptimeSeconds: 821_422, memory: { rss: 384_000_000, heapTotal: 180_000_000, heapUsed: 112_000_000, external: 8_000_000 }, nodeVersion: "v22.17.0" },
  database: { database: "orbit", version: "PostgreSQL 17 (demo)", sizeBytes: 2_800_000_000, serverTime: new Date().toISOString(), latencyMs: 4 },
  queue: { failedTransfers: 1, runningTransfers: 18 },
  tables: [{ table: "audit_events", estimatedRows: 482_104 }, { table: "transfers", estimatedRows: 92_881 }, { table: "backups", estimatedRows: 18_420 }],
  migrations: [{ name: "001_initial_schema", appliedAt: new Date(Date.now() - 7 * 86_400_000).toISOString() }],
};

export function SystemAdminPage() {
  const resource = useAdminResource("admin-system", fallback, adminApi.system);
  const [tab, setTab] = useState("runtime");
  const [refreshing, setRefreshing] = useState(false);
  const memory = resource.data.api.memory;

  async function refresh() {
    setRefreshing(true);
    const result = await resource.refresh();
    setRefreshing(false);
    if (result === "live") toast.success("Live system snapshot refreshed");
    else if (result === "demo") toast.message("Demo system snapshot refreshed locally", { description: "Sign in as a platform administrator for live data." });
    else toast.error("The live system snapshot could not be refreshed", { description: "Labeled demo data remains visible." });
  }

  return <>
    <AdminPageHeader title="System settings" description="Read-only runtime, PostgreSQL, queue, table, and migration telemetry from the authenticated system API." actions={<><AdminButton onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : undefined} />{refreshing ? "Refreshing" : "Refresh snapshot"}</AdminButton><AdminButton variant="primary" onClick={() => unsupported("Platform configuration persistence")}><Save />Save configuration <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="API process" value={resource.data.api.status} detail={`${Math.floor(resource.data.api.uptimeSeconds / 3600)}h uptime`} icon={CloudCog} /><Stat label="Heap used" value={formatBytes(memory.heapUsed)} detail={`${Math.round(memory.heapUsed / Math.max(memory.heapTotal, 1) * 100)}% of allocated heap`} icon={Activity} /><Stat label="Database latency" value={`${resource.data.database.latencyMs} ms`} detail={resource.data.database.database} icon={Database} /><Stat label="Schema migrations" value={resource.data.migrations.length} detail="recorded migrations" icon={Braces} /></div>
    <div className="adm-panel mb-3"><Segments value={tab} onChange={setTab} items={[{ value: "runtime", label: "RUNTIME" }, { value: "database", label: "DATABASE" }, { value: "schema", label: "SCHEMA" }, { value: "controls", label: "CONTROLS" }]} /></div>

    {tab === "runtime" && <div className="adm-grid two"><Panel title="API runtime" description="Current backend process"><div className="adm-kpi-row"><span>Status</span><StatusPill status={resource.data.api.status === "healthy" ? "healthy" : "warning"} label={resource.data.api.status} /></div><div className="adm-kpi-row"><span>Node runtime</span><span className="adm-mono">{resource.data.api.nodeVersion}</span></div><div className="adm-kpi-row"><span>Process uptime</span><span>{Math.floor(resource.data.api.uptimeSeconds / 3600)}h {Math.floor(resource.data.api.uptimeSeconds % 3600 / 60)}m</span></div><div className="adm-kpi-row"><span>Resident memory</span><span>{formatBytes(memory.rss)}</span></div><div className="adm-kpi-row"><span>Heap allocated</span><span>{formatBytes(memory.heapTotal)}</span></div><div className="adm-kpi-row"><span>Heap used</span><span>{formatBytes(memory.heapUsed)}</span></div></Panel><Panel title="Transfer queue · last 24 hours" description="Persisted transfer state counts"><div className="adm-kpi-row"><span>Running transfers</span><span>{resource.data.queue.runningTransfers}</span></div><div className="adm-kpi-row"><span>Failed transfers</span><span>{resource.data.queue.failedTransfers}</span></div><div className={resource.data.queue.failedTransfers ? "adm-notice warning mt-3" : "adm-notice mt-3"}>{resource.data.queue.failedTransfers ? <TriangleAlert /> : <ShieldCheck />}{resource.data.queue.failedTransfers ? "Failed transfers need operator review in the jobs console." : "No failed transfers were recorded in the current window."}</div></Panel></div>}

    {tab === "database" && <div className="adm-grid two"><Panel title="PostgreSQL primary" description="Live database metadata"><div className="adm-kpi-row"><span>Database</span><span className="adm-mono">{resource.data.database.database}</span></div><div className="adm-kpi-row"><span>Database size</span><span>{formatBytes(Number(resource.data.database.sizeBytes))}</span></div><div className="adm-kpi-row"><span>Query latency</span><span>{resource.data.database.latencyMs} ms</span></div><div className="adm-kpi-row"><span>Server time</span><span>{new Date(resource.data.database.serverTime).toLocaleString()}</span></div><p className="adm-section-label">Version</p><pre className="adm-code whitespace-pre-wrap">{resource.data.database.version}</pre></Panel><Panel title="Largest tables" description="PostgreSQL live-row estimates" bodyClassName="flush"><ul className="adm-list">{resource.data.tables.map((table) => <li className="adm-list-item" key={table.table}><Database /><div className="adm-list-copy"><b className="adm-mono">{table.table}</b><small>Estimated live rows</small></div><span className="adm-list-meta">{Number(table.estimatedRows).toLocaleString()}</span></li>)}</ul></Panel></div>}

    {tab === "schema" && <div className="adm-grid two"><Panel title="Applied migrations" description="Schema history returned by the backend" bodyClassName="flush"><ul className="adm-list">{resource.data.migrations.map((migration) => <li className="adm-list-item" key={`${migration.name}-${migration.appliedAt}`}><Braces /><div className="adm-list-copy"><b className="adm-mono">{migration.name}</b><small>Applied {relativeTime(migration.appliedAt)}</small></div><StatusPill status="active" label="Applied" /></li>)}</ul></Panel><Panel title="Schema controls" description="Operational boundary"><div className="adm-notice"><ShieldCheck />Migrations are read-only in the browser. Apply and verify them through the backend deployment workflow so credentials and migration locks remain server-side.</div><AdminButton className="mt-3" onClick={() => unsupported("Browser-initiated schema migration")}><Settings2 />Run migration <small>Unsupported</small></AdminButton></Panel></div>}

    {tab === "controls" && <div className="adm-grid two"><Panel title="Service controls" description="Not yet exposed by the backend admin API"><div className="adm-check-row"><span><b>Rolling API restart</b><small>Requires a deployment-orchestrator endpoint.</small></span><AdminButton size="small" onClick={() => unsupported("Rolling API restart")}><RefreshCw />Unsupported</AdminButton></div><div className="adm-check-row"><span><b>Maintenance mode</b><small>Requires a durable platform state and audited mutation.</small></span><AdminButton size="small" variant="danger" onClick={() => unsupported("Platform maintenance mode")}>Unsupported</AdminButton></div><div className="adm-check-row"><span><b>Platform API keys</b><small>Requires encrypted credential lifecycle endpoints.</small></span><AdminButton size="small" onClick={() => unsupported("Platform API key management")}>Unsupported</AdminButton></div></Panel><Panel title="Current contract" description="Server-authoritative system access"><div className="adm-notice"><ServerCog />GET /admin/system provides runtime, database, queue, table, and migration state. This page does not simulate configuration saves, restarts, maintenance changes, keys, or webhooks.</div></Panel></div>}
  </>;
}

export default SystemAdminPage;
