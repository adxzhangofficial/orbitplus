import { useMemo, useState } from "react";
import { Activity, Cable, Download, Gauge, MoreHorizontal, Plus, Server, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { fleetServers } from "./_data";
import { AdminDataNotice, adminApi, unsupported, useAdminResource } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Pagination, Panel, SearchBox, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

interface AdminFleetEndpoint {
  id: string;
  name: string;
  organization: string;
  organizationId: string;
  environment: string;
  status: "online" | "offline" | "degraded" | "unknown" | "maintenance";
  host: string;
  lastSeen?: string;
}

const fallbackFleet: AdminFleetEndpoint[] = fleetServers.map((server) => ({ id: server.id, name: server.name, organization: server.organization, organizationId: `demo_${server.organization}`, environment: server.environment, status: server.status, host: server.host, lastSeen: server.lastSeen }));

async function loadFleet(): Promise<AdminFleetEndpoint[]> {
  const directory = await adminApi.directory();
  return directory.details.flatMap((detail) => detail.servers.map((server) => ({ ...server, organization: detail.organization.name, organizationId: detail.organization.id, lastSeen: server.lastCheckedAt })));
}

export function ServerFleetAdminPage() {
  const resource = useAdminResource("admin-server-fleet", fallbackFleet, loadFleet);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const selected = resource.data.find((item) => item.id === selectedId);
  const filtered = useMemo(() => resource.data.filter((item) => `${item.name} ${item.host} ${item.organization}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || item.status === status) && (environment === "all" || item.environment === environment)), [environment, query, resource.data, status]);
  const pagination = usePagination(filtered, 8);
  const online = resource.data.filter((item) => item.status === "online").length;
  const organizations = new Set(resource.data.map((item) => item.organizationId)).size;

  function exportFleet() {
    downloadCsv("orbit-server-fleet.csv", filtered.map(({ id, name, organization, organizationId, host, status: state, environment: env, lastSeen }) => ({ id, name, organization, organizationId, host, status: state, environment: env, lastCheckedAt: lastSeen ?? "" })));
    toast.success("Fleet inventory exported");
  }

  return <>
    <AdminPageHeader title="Server fleet & connections" description="Read-only platform inventory aggregated from authenticated customer detail APIs." actions={<><AdminButton onClick={exportFleet}><Download />Export inventory</AdminButton><AdminButton variant="primary" onClick={() => unsupported("Platform-wide connection creation")}><Plus />Add connection <small>API required</small></AdminButton></>} />
    <div className="mb-3"><AdminDataNotice source={resource.source} error={resource.error} /></div>
    <div className="adm-stats"><Stat label="Managed endpoints" value={resource.data.length} detail="registered connections" icon={Server} /><Stat label="Online now" value={`${online}/${resource.data.length}`} detail="last persisted state" icon={Activity} /><Stat label="Customer tenants" value={organizations} detail="with server connections" icon={Cable} /><Stat label="Unavailable" value={resource.data.filter((item) => item.status !== "online").length} detail="offline, degraded, or unknown" icon={Gauge} /></div>

    <div className="adm-grid two"><div><div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search endpoint, host, or tenant…" /><select className="adm-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Any status</option><option value="online">Online</option><option value="degraded">Degraded</option><option value="offline">Offline</option><option value="unknown">Unknown</option><option value="maintenance">Maintenance</option></select><select className="adm-select" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="all">Any environment</option><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></select></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Endpoint</th><th>Status</th><th>Tenant</th><th>Environment</th><th>Last checked</th><th>Telemetry</th><th /></tr></thead><tbody>{pagination.rows.map((server) => <tr className="clickable" key={server.id} onClick={() => setSelectedId(server.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><Server /></span><div className="adm-cell-copy"><b>{server.name}</b><small className="adm-mono">sftp://{server.host}</small></div></div></td><td><StatusPill status={server.status} /></td><td>{server.organization}</td><td><StatusPill status="neutral" label={server.environment} noDot /></td><td>{server.lastSeen ? relativeTime(server.lastSeen) : "Not checked"}</td><td><StatusPill status="neutral" label="Not exposed" noDot /></td><td><IconAction label="Inspect endpoint" onClick={(event) => { event.stopPropagation(); setSelectedId(server.id); }}><MoreHorizontal /></IconAction></td></tr>)}</tbody></table><Pagination {...pagination} onPage={pagination.setPage} /></div></div>
      <Panel title="Fleet posture" description="Persisted connection status from every loaded tenant"><div className="adm-kpi-row"><span>Online</span><span>{online}</span></div><div className="adm-kpi-row"><span>Offline</span><span>{resource.data.filter((item) => item.status === "offline").length}</span></div><div className="adm-kpi-row"><span>Degraded</span><span>{resource.data.filter((item) => item.status === "degraded").length}</span></div><div className="adm-kpi-row"><span>Unknown</span><span>{resource.data.filter((item) => item.status === "unknown").length}</span></div><p className="adm-section-label">API coverage</p><div className="adm-notice"><ShieldCheck />The admin API exposes endpoint identity, host, environment, status, and last-check time. Sessions, region, resource metrics, diagnostics, and mutations need dedicated platform fleet endpoints.</div></Panel>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.name ?? "Endpoint"} description={selected ? `SFTP · ${selected.host}` : undefined} footer={selected && <><AdminButton onClick={() => unsupported("Platform maintenance mode for a server")}><Wrench />Drain <small>Unsupported</small></AdminButton><AdminButton variant="primary" onClick={() => unsupported("Remote agent restart")}>Restart agent <small>Unsupported</small></AdminButton></>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.status} /><span className="adm-mono">{selected.id}</span></div><DetailGrid items={[["Organization", selected.organization], ["Organization ID", <span className="adm-mono">{selected.organizationId}</span>], ["Environment", selected.environment], ["Host", <span className="adm-mono">{selected.host}</span>], ["Last checked", selected.lastSeen ? new Date(selected.lastSeen).toLocaleString() : "Not available"], ["Metrics", "Not exposed by admin API"]]} /><p className="adm-section-label">Operator commands</p><div className="adm-grid equal"><AdminButton onClick={() => unsupported("Cross-tenant connectivity probe")}>Run probe <small>Unsupported</small></AdminButton><AdminButton onClick={() => unsupported("Cross-tenant diagnostic stream")}>Tail diagnostics <small>Unsupported</small></AdminButton></div><div className="adm-notice mt-4"><ShieldCheck />This is a live inventory view. No connection credentials are returned to the platform browser.</div></>}
    </Drawer>
  </>;
}

export default ServerFleetAdminPage;
