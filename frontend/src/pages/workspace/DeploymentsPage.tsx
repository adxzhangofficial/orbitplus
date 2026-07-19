import { useMemo, useState } from "react";
import { Box, CheckCircle2, Clock3, GitBranch, GitCommit, Plus, Rocket, RotateCcw, SearchX, ServerCog, XCircle } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceDataStatus } from "@/components/workspace-data-status";
import { api } from "@/lib/api";
import { deployments as seedDeployments, servers as seedServers } from "@/lib/mock-data";
import { useLiveResource } from "@/lib/use-live-resource";
import { relativeTime } from "@/lib/utils";
import type { Deployment } from "@/types";
import { buttonClass, controlClass, EmptyState, Modal, PageHeader, Panel, primaryButtonClass, SearchField, Stat, StatusBadge, tableClass, tableWrapClass, tdClass, thClass } from "./_shared";

type ServerOption = { id: string; workspaceId: string; name: string; environment: "development" | "staging" | "production" };
type BackendDeployment = { id: string; workspaceId: string; serverId: string; serverName?: string; name: string; environment: string; version: string; previousVersion?: string; status: string; commitSha?: string; metadata?: Record<string, unknown>; createdAt: string; completedAt?: string };
type DeploymentRow = Deployment & { workspaceId?: string; serverId?: string; version?: string; serverName?: string; metadata?: Record<string, unknown> };

function titleCase(value: string) { return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value; }
function duration(start: string, end?: string) { if (!end) return "In progress"; const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)); return seconds > 59 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`; }
function toDeployment(item: BackendDeployment): DeploymentRow {
  const branch = typeof item.metadata?.branch === "string" ? item.metadata.branch : "manual";
  const author = typeof item.metadata?.author === "string" ? item.metadata.author : "Orbit operator";
  const status: Deployment["status"] = item.status === "succeeded" || item.status === "rolled_back" ? "ready" : item.status === "running" ? "building" : item.status === "failed" ? "failed" : "cancelled";
  return { id: item.id, project: item.name, environment: titleCase(item.environment), branch, commit: item.commitSha ?? item.version, author, status, duration: duration(item.createdAt, item.completedAt), createdAt: item.createdAt, workspaceId: item.workspaceId, serverId: item.serverId, version: item.version, serverName: item.serverName, metadata: item.metadata };
}

export function DeploymentsPage() {
  const previewRows: DeploymentRow[] = seedDeployments;
  const deployments = useLiveResource(previewRows, [] as DeploymentRow[], async () => (await api.get<BackendDeployment[]>("/deployments?limit=100")).map(toDeployment));
  const servers = useLiveResource(seedServers.map((server) => ({ id: server.id, workspaceId: "preview", name: server.name, environment: server.environment })), [] as ServerOption[], () => api.get<ServerOption[]>("/servers?limit=100"));
  const { data: items, setData: setItems, live } = deployments;
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ project: "acme-api", serverId: seedServers[0].id, environment: "production" as ServerOption["environment"], branch: "main", version: "release-1" });
  const filtered = useMemo(() => items.filter((item) => (environment === "all" || item.environment.toLowerCase() === environment) && `${item.project} ${item.branch} ${item.commit} ${item.author}`.toLowerCase().includes(query.toLowerCase())), [items, query, environment]);

  async function deploy() {
    const server = servers.data.find((row) => row.id === draft.serverId) ?? servers.data[0];
    if (!server) { toast.error("Connect a server before deploying"); return; }
    if (live) {
      try {
        const created = await api.post<BackendDeployment>("/deployments", { workspaceId: server.workspaceId, serverId: server.id, name: draft.project, environment: draft.environment, version: draft.version, commitSha: draft.version.slice(0, 64), metadata: { branch: draft.branch } });
        setItems((current) => [toDeployment({ ...created, serverName: server.name }), ...current]);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create deployment"); return; }
    } else {
      setItems((current) => [{ id: `d_${Date.now()}`, project: draft.project, environment: titleCase(draft.environment), branch: draft.branch, commit: draft.version, author: "Preview operator", status: "building", duration: "0s", createdAt: new Date().toISOString() }, ...current]);
    }
    setOpen(false);
    toast.success(live ? `Deployment to ${titleCase(draft.environment)} completed` : "Preview deployment started");
  }

  async function rollback(item: DeploymentRow) {
    if (!live) { toast.warning(`Preview rollback to ${item.commit} started`); return; }
    try { await api.post(`/deployments/${item.id}/rollback`); toast.success(`${item.project} rolled back`); await deployments.refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to roll back deployment"); }
  }

  async function redeploy(item: DeploymentRow) {
    if (!live) { toast.success(`${item.project} preview redeployment queued`); return; }
    if (!item.workspaceId || !item.serverId) { toast.error("Deployment target metadata is missing"); return; }
    try {
      const created = await api.post<BackendDeployment>("/deployments", { workspaceId: item.workspaceId, serverId: item.serverId, name: item.project, environment: item.environment.toLowerCase(), version: `${item.version ?? item.commit}-redeploy`, commitSha: item.commit.slice(0, 64), metadata: { ...item.metadata, branch: item.branch, redeployedFrom: item.id } });
      setItems((current) => [toDeployment({ ...created, serverName: item.serverName }), ...current]);
      toast.success(`${item.project} redeployed`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to redeploy"); }
  }

  const liveEnvironments = [...new Set(items.map((item) => item.environment.toLowerCase()))];
  return <div className="space-y-5">
    <PageHeader eyebrow="Release operations" title="Deployments" description="Promote code with guarded releases, health checks, and instant rollback points." actions={<button className={primaryButtonClass} onClick={() => setOpen(true)}><Plus className="size-3.5" />New deployment</button>} />
    <WorkspaceDataStatus live={live} loading={deployments.loading || servers.loading} error={deployments.error ?? servers.error} onRetry={() => { void deployments.refresh().catch(() => undefined); void servers.refresh().catch(() => undefined); }} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Successful" value={items.filter((item) => item.status === "ready").length} detail="Loaded deployment history" icon={CheckCircle2} tone="emerald" /><Stat label="Building" value={items.filter((item) => item.status === "building").length} detail="Live pipeline" icon={Rocket} tone="indigo" /><Stat label="Failed" value={items.filter((item) => item.status === "failed").length} detail="Requires review" icon={XCircle} tone="rose" /><Stat label="Targets" value={new Set(items.map((item) => item.environment)).size} detail="Deployment environments" icon={Clock3} tone="sky" /></div>
    <div className="grid gap-3 lg:grid-cols-3">{(live ? servers.data.slice(0, 3).map((server) => ({ name: titleCase(server.environment), branch: "Managed release", health: "Connected", version: server.name })) : [{ name: "Production", branch: "main", health: "Healthy", version: "4f32c1a" }, { name: "Staging", branch: "feat/tax-v2", health: "Building", version: "a110bc8" }, { name: "Preview", branch: "Pull requests", health: "On demand", version: "Auto" }]).map((env, index) => <div key={`${env.name}-${index}`} className="rounded-xl border border-white/[0.07] bg-[#101218] p-4"><div className="flex items-start justify-between"><span className="grid size-9 place-items-center rounded-lg bg-white/[0.04] text-zinc-400"><ServerCog className="size-4" /></span><StatusBadge status={env.health.toLowerCase()} /></div><h3 className="mt-4 text-sm font-semibold text-zinc-100">{env.name}</h3><div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500"><span className="inline-flex items-center gap-1"><GitBranch className="size-3" />{env.branch}</span><span className="inline-flex items-center gap-1 font-mono"><GitCommit className="size-3" />{env.version}</span></div></div>)}</div>
    <Panel title="Deployment history" description="Every release includes immutable version and target metadata" flush><div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row"><SearchField value={query} onChange={setQuery} placeholder="Search project, branch, commit, or author" /><select value={environment} onChange={(event) => setEnvironment(event.target.value)} className={controlClass}><option value="all">All environments</option>{(liveEnvironments.length ? liveEnvironments : ["production", "staging"]).map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></div>{filtered.length ? <div className={tableWrapClass}><table className={tableClass}><thead><tr><th className={thClass}>Project</th><th className={thClass}>Source</th><th className={thClass}>Environment</th><th className={thClass}>Actor</th><th className={thClass}>Duration</th><th className={thClass}>Status</th><th className={thClass} /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="hover:bg-white/[0.02]"><td className={tdClass}><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300"><Box className="size-3.5" /></span><div><p className="font-medium text-zinc-200">{item.project}</p><p className="mt-1 text-[10px] text-zinc-600">{relativeTime(item.createdAt)}</p></div></div></td><td className={tdClass}><p className="inline-flex items-center gap-1"><GitBranch className="size-3" />{item.branch}</p><p className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-zinc-600"><GitCommit className="size-3" />{item.commit}</p></td><td className={tdClass}>{item.environment}</td><td className={tdClass}>{item.author}</td><td className={tdClass}>{item.duration}</td><td className={tdClass}><StatusBadge status={item.status} /></td><td className={tdClass}><div className="flex justify-end gap-1"><button className={buttonClass} onClick={() => void redeploy(item)}><Rocket className="size-3" />Redeploy</button>{item.status === "ready" ? <button className={buttonClass} onClick={() => void rollback(item)}><RotateCcw className="size-3" />Rollback</button> : null}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={SearchX} title="No deployments found" description="Try a different project, actor, or environment filter." />}</Panel>
    <Modal open={open} onClose={() => setOpen(false)} title="Create deployment" description="Publish a version to one connected server target." footer={<><button className={buttonClass} onClick={() => setOpen(false)}>Cancel</button><button className={primaryButtonClass} onClick={() => void deploy()}><Rocket className="size-3.5" />Deploy now</button></>}><div className="grid gap-4"><label className="text-xs text-zinc-400">Project<input value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label><label className="text-xs text-zinc-400">Target server<select value={draft.serverId} onChange={(event) => { const server = servers.data.find((row) => row.id === event.target.value); setDraft({ ...draft, serverId: event.target.value, environment: server?.environment ?? draft.environment }); }} className={`${controlClass} mt-1.5 w-full`}>{servers.data.map((server) => <option key={server.id} value={server.id}>{server.name} · {server.environment}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Version<input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label><label className="text-xs text-zinc-400">Source branch<input value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} className={`${controlClass} mt-1.5 w-full`} /></label></div></div></Modal>
  </div>;
}

export default DeploymentsPage;
