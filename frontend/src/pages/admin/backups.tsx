import { useMemo, useState } from "react";
import { ArchiveRestore, DatabaseBackup, Download, HardDrive, MoreHorizontal, Plus, RotateCcw, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils";
import { platformBackups } from "./_data";
import { AdminDataNotice, adminApi, unsupported, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Pagination, Panel, SearchBox, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

interface BackupCoverage {
  organizationId: string;
  organization: string;
  plan: "free" | "pro" | "enterprise";
  status: string;
  servers: number;
  backups: number;
  transfers: number;
  deployments: number;
  storageBytes: number;
}

const fallbackCoverage: BackupCoverage[] = [...new Set(platformBackups.map((backup) => backup.organization))].map((organization, index) => {
  const rows = platformBackups.filter((backup) => backup.organization === organization);
  return { organizationId: `demo_${index}`, organization, plan: index === 2 ? "enterprise" : "pro", status: "active", servers: new Set(rows.map((backup) => backup.server)).size, backups: rows.length, transfers: 42 + index * 8, deployments: 12 + index, storageBytes: rows.reduce((sum, backup) => sum + backup.size, 0) };
});

async function loadCoverage(): Promise<BackupCoverage[]> {
  const directory = await adminApi.directory();
  return directory.details.map((detail) => ({ organizationId: detail.organization.id, organization: detail.organization.name, plan: detail.organization.plan, status: detail.organization.status, servers: detail.servers.length, backups: detail.usage.backups, transfers: detail.usage.transfers, deployments: detail.usage.deployments, storageBytes: Number(directory.customers.find((customer) => customer.id === detail.organization.id)?.backupBytes ?? 0) }));
}

export function BackupsAdminPage() {
  const resource = useAdminResource("admin-backup-coverage", fallbackCoverage, loadCoverage);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const selected = resource.data.find((item) => item.organizationId === selectedId);
  const filtered = useMemo(() => resource.data.filter((item) => `${item.organization} ${item.organizationId} ${item.plan}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || item.status === status)), [query, resource.data, status]);
  const pagination = usePagination(filtered, 8);
  const stored = resource.data.reduce((sum, item) => sum + item.storageBytes, 0);
  const recoveryPoints = resource.data.reduce((sum, item) => sum + item.backups, 0);
  const protectedEndpoints = resource.data.reduce((sum, item) => sum + item.servers, 0);

  function exportCoverage() {
    downloadCsv("orbit-backup-coverage.csv", filtered.map((item) => ({ ...item })));
    toast.success("Backup coverage exported");
  }

  return <>
    <AdminPageHeader title="Backups & storage" description="Platform-wide recovery coverage derived from live customer usage and storage aggregates." actions={<><AdminButton onClick={() => unsupported("Platform storage reconciliation")}><RotateCcw />Reconcile <small>API required</small></AdminButton><AdminButton variant="primary" onClick={() => unsupported("Cross-tenant on-demand backup")}><Plus />Run backup <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Protected endpoints" value={protectedEndpoints} detail="registered tenant servers" icon={ShieldCheck} /><Stat label="Stored data" value={formatBytes(stored)} detail="completed backup bytes" icon={HardDrive} /><Stat label="Recovery points" value={recoveryPoints} detail="tenant lifetime count" icon={DatabaseBackup} /><Stat label="Covered organizations" value={resource.data.filter((item) => item.backups > 0).length} detail={`of ${resource.data.length} loaded`} icon={ArchiveRestore} /></div>

    <div className="adm-grid two"><div><div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search organization, plan, or tenant ID…" /><select className="adm-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Any tenant status</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select><AdminButton size="small" onClick={exportCoverage}><Download />Export</AdminButton></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Organization</th><th>Status</th><th>Plan</th><th>Servers</th><th>Recovery points</th><th>Stored data</th><th /></tr></thead><tbody>{pagination.rows.map((row) => <tr className="clickable" key={row.organizationId} onClick={() => setSelectedId(row.organizationId)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><DatabaseBackup /></span><div className="adm-cell-copy"><b>{row.organization}</b><small className="adm-mono">{row.organizationId}</small></div></div></td><td><StatusPill status={row.status} /></td><td><StatusPill status={row.plan === "enterprise" ? "lime" : row.plan === "pro" ? "info" : "neutral"} label={row.plan} noDot /></td><td className="adm-num">{row.servers}</td><td className="adm-num">{row.backups}</td><td className="adm-num">{formatBytes(row.storageBytes)}</td><td><IconAction label="Inspect backup coverage" onClick={(event) => { event.stopPropagation(); setSelectedId(row.organizationId); }}><MoreHorizontal /></IconAction></td></tr>)}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div></div>
      <div className="adm-grid"><Panel title="Protection posture" description="Live platform aggregates"><div className="adm-kpi-row"><span>Organizations with recovery points</span><span>{resource.data.filter((item) => item.backups > 0).length}</span></div><div className="adm-kpi-row"><span>Organizations without backups</span><span>{resource.data.filter((item) => item.backups === 0).length}</span></div><div className="adm-kpi-row"><span>Average backups / tenant</span><span>{(recoveryPoints / Math.max(resource.data.length, 1)).toFixed(1)}</span></div><div className="adm-kpi-row"><span>Storage accounted</span><span>{formatBytes(stored)}</span></div></Panel><Panel title="API coverage" description="What this platform view can safely assert"><div className="adm-notice"><ShieldCheck />The admin API reports completed backup bytes and per-tenant backup counts. Snapshot manifests, schedules, restore controls, regions, and retention require new platform-admin endpoints.</div></Panel></div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.organization ?? "Backup coverage"} description={selected?.organizationId} footer={selected && <><AdminButton onClick={() => unsupported("Cross-tenant backup manifest download")}><Download />Manifest <small>Unsupported</small></AdminButton><AdminButton variant="primary" onClick={() => unsupported("Cross-tenant restore")}><ArchiveRestore />Restore <small>Unsupported</small></AdminButton></>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.status} /><StatusPill status={selected.plan === "enterprise" ? "lime" : "info"} label={selected.plan} noDot /></div><DetailGrid items={[["Servers", selected.servers], ["Recovery points", selected.backups], ["Stored data", formatBytes(selected.storageBytes)], ["Transfers", selected.transfers], ["Deployments", selected.deployments], ["Inventory level", "Tenant aggregate"]]} /><p className="adm-section-label">Recovery inventory</p><div className="adm-check-row"><span><b>Backup record listing</b><small>Not exposed by the platform-admin API.</small></span><StatusPill status="neutral" label="Unavailable" noDot /></div><div className="adm-check-row"><span><b>Restore execution</b><small>Tenant API exists, but no cross-tenant admin contract is exposed.</small></span><StatusPill status="neutral" label="Unavailable" noDot /></div><div className="adm-notice mt-4"><Server />Use the customer workspace with explicit tenant membership for individual backup and restore operations.</div></>}
    </Drawer>
  </>;
}

export default BackupsAdminPage;
