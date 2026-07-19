import { useMemo, useState } from "react";
import { Ban, CircleCheck, Clock3, Cpu, Download, MoreHorizontal, Pause, Play, RefreshCw, RotateCcw, TimerReset, Workflow, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { platformJobs, type JobState, type PlatformJob } from "./_data";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Pagination, Panel, ProgressBar, SearchBox, Segments, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

const workerPools = [
  { name: "transfer-workers", active: 8, total: 10, queue: 12, load: 74 },
  { name: "backup-workers", active: 3, total: 4, queue: 2, load: 62 },
  { name: "deploy-workers", active: 5, total: 6, queue: 4, load: 81 },
];

export function JobsAdminPage() {
  const [rows, setRows] = useState(platformJobs);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [paused, setPaused] = useState(false);
  const selected = rows.find((job) => job.id === selectedId);
  const filtered = useMemo(() => rows.filter((job) => `${job.name} ${job.organization} ${job.target} ${job.id}`.toLowerCase().includes(query.toLowerCase()) && (tab === "all" || job.status === tab || (tab === "active" && ["running", "queued", "retrying"].includes(job.status))) && (type === "all" || job.type === type)), [query, rows, tab, type]);
  const pagination = usePagination(filtered, 7);

  function patchJob(id: string, patch: Partial<PlatformJob>) { setRows((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job)); }
  function retry(job: PlatformJob) {
    patchJob(job.id, { status: "retrying", attempts: job.attempts + 1, progress: Math.min(job.progress, 12), worker: "Awaiting worker" }); toast.message(`Retry queued for ${job.name}`);
    window.setTimeout(() => { patchJob(job.id, { status: "running", worker: "transfer-02", progress: 28 }); toast.success(`${job.name} is running`); }, 900);
  }
  function cancel(job: PlatformJob) { patchJob(job.id, { status: "cancelled", progress: job.progress }); toast.success(`${job.name} cancelled`); }
  const failed = rows.filter((job) => job.status === "failed").length;
  const active = rows.filter((job) => ["queued", "running", "retrying"].includes(job.status)).length;

  return <>
    <AdminPageHeader title="Jobs & queues" description="Operate asynchronous transfers, deployments, snapshots, and maintenance workloads across the shared worker plane." actions={<><AdminButton onClick={() => { setPaused((value) => !value); toast.warning(paused ? "Queue intake resumed" : "Queue intake paused"); }}>{paused ? <Play /> : <Pause />}{paused ? "Resume intake" : "Pause intake"}</AdminButton><AdminButton variant="primary" onClick={() => { setRows((current) => current.map((job) => job.status === "failed" ? { ...job, status: "queued" as JobState, progress: 0, attempts: job.attempts + 1 } : job)); toast.success(`${failed} failed jobs requeued`); }} disabled={!failed}><RotateCcw />Retry failed</AdminButton></>} />
    {paused && <div className="adm-notice warning mb-3"><Pause />New jobs are being held at ingress. Running work is not interrupted.</div>}
    <div className="adm-stats"><Stat label="Jobs in flight" value={active} change="+3" detail="last 15 minutes" icon={Zap} /><Stat label="Queued" value={rows.filter((job) => job.status === "queued").length} change="42 sec" detail="oldest wait" icon={Clock3} /><Stat label="Success rate" value="98.7%" change="+0.4%" detail="rolling 24 hours" icon={CircleCheck} /><Stat label="Failed" value={failed} change="-8" detail="vs previous day" icon={XCircle} data={[18, 17, 15, 14, 12, 9, 7, 5]} /></div>

    <div className="adm-grid two">
      <div>
        <div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search job ID, resource, or organization…" /><select className="adm-select" value={type} onChange={(event) => setType(event.target.value)}><option value="all">All job types</option>{[...new Set(rows.map((job) => job.type))].map((value) => <option key={value}>{value}</option>)}</select><AdminButton size="small" variant="ghost" onClick={() => { downloadCsv("orbit-jobs.csv", filtered.map(({ id, type: kind, name, organization, target, status, attempts, worker }) => ({ id, type: kind, name, organization, target, status, attempts, worker }))); toast.success("Job history exported"); }}><Download />Export</AdminButton></div>
        <div className="adm-panel rounded-t-none"><Segments value={tab} onChange={setTab} items={[{ value: "all", label: `ALL ${rows.length}` }, { value: "active", label: `ACTIVE ${active}` }, { value: "failed", label: `FAILED ${failed}` }, { value: "complete", label: "COMPLETE" }]} /><div className="overflow-x-auto"><table className="adm-table"><thead><tr><th>Job</th><th>State</th><th>Tenant / target</th><th>Progress</th><th>Worker</th><th>Attempts</th><th>Created</th><th /></tr></thead><tbody>
          {pagination.rows.map((job) => <tr className="clickable" key={job.id} onClick={() => setSelectedId(job.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><Workflow /></span><div className="adm-cell-copy"><b>{job.name}</b><small>{job.type} · <span className="adm-mono">{job.id}</span></small></div></div></td><td><StatusPill status={job.status} /></td><td><div className="adm-cell-copy"><b>{job.organization}</b><small>{job.target}</small></div></td><td><div style={{ width: 110 }}><ProgressBar value={job.progress} tone={job.status === "failed" ? "danger" : job.status === "retrying" ? "warning" : undefined} /></div></td><td className="adm-mono">{job.worker}</td><td className="adm-num">{job.attempts}</td><td>{relativeTime(job.createdAt)}</td><td><IconAction label="Inspect job" onClick={(event) => { event.stopPropagation(); setSelectedId(job.id); }}><MoreHorizontal /></IconAction></td></tr>)}
        </tbody></table></div><Pagination {...pagination} onPage={pagination.setPage} /></div>
      </div>
      <div className="adm-grid">
        <Panel title="Worker pools" description="Live capacity and queue pressure" action={<StatusPill status="healthy" label="18 workers" />} bodyClassName="flush"><ul className="adm-list">{workerPools.map((pool) => <li className="adm-list-item" key={pool.name}><Cpu /><div className="adm-list-copy"><b>{pool.name}</b><small>{pool.active} active / {pool.total} provisioned · {pool.queue} queued</small></div><div style={{ width: 75 }}><ProgressBar value={pool.load} tone={pool.load > 80 ? "warning" : undefined} /></div></li>)}</ul></Panel>
        <Panel title="Queue latency" description="P95 dispatch latency by workload"><div className="adm-kpi-row"><span>Transfers</span><span>1.8 sec</span></div><div className="adm-kpi-row"><span>Deployments</span><span>3.2 sec</span></div><div className="adm-kpi-row"><span>Backups</span><span className="adm-stat-change down">18.4 sec</span></div><div className="adm-kpi-row"><span>Maintenance</span><span>6.1 sec</span></div></Panel>
        <Panel title="Dead-letter queue" description="Workloads requiring operator review"><div className="flex items-center justify-between"><div><strong className="text-xl">3</strong><p className="text-[8px] text-zinc-500 mt-1">1 new in the last hour</p></div><AdminButton size="small" onClick={() => toast.message("Dead-letter review opened")}>Review payloads</AdminButton></div></Panel>
      </div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.name ?? "Job"} description={selected ? `${selected.type} · ${selected.id}` : undefined} footer={selected && <>{["failed", "cancelled"].includes(selected.status) && <AdminButton onClick={() => retry(selected)}><RotateCcw />Retry job</AdminButton>}{["running", "queued", "retrying"].includes(selected.status) && <AdminButton variant="danger" onClick={() => cancel(selected)}><Ban />Cancel job</AdminButton>}<AdminButton variant="primary" onClick={() => toast.success("Diagnostic bundle generated") }><Download />Download diagnostics</AdminButton></>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.status} /><span className="adm-mono">attempt {selected.attempts}</span></div><ProgressBar value={selected.progress} tone={selected.status === "failed" ? "danger" : undefined} /><p className="adm-section-label">Execution context</p><DetailGrid items={[["Organization", selected.organization], ["Target", selected.target], ["Worker", selected.worker], ["Duration", selected.duration], ["Created", relativeTime(selected.createdAt)], ["Attempts", selected.attempts]]} /><p className="adm-section-label">Event timeline</p><ul className="adm-list border border-white/10 rounded-md">{[["Job accepted at ingress", selected.createdAt], [selected.worker === "Unassigned" ? "Waiting for an available worker" : `Claimed by ${selected.worker}`, selected.createdAt], [selected.status === "failed" ? "Worker returned SFTP_CONNECTION_RESET" : `Progress checkpoint · ${selected.progress}%`, new Date().toISOString()]].map(([event, time], index) => <li className="adm-list-item" key={`${event}-${index}`}><TimerReset /><div className="adm-list-copy"><b>{event}</b><small>{relativeTime(time)}</small></div></li>)}</ul><p className="adm-section-label">Worker log tail</p><pre className="adm-code">{`[02:18:41.904] claimed job ${selected.id}\n[02:18:42.112] resolved target ${selected.target}\n[02:18:43.871] checkpoint persisted (${selected.progress}%)\n${selected.status === "failed" ? "[02:18:44.004] ERROR connection reset by peer" : "[02:18:44.004] heartbeat acknowledged"}`}</pre></>}
    </Drawer>
  </>;
}

export default JobsAdminPage;
