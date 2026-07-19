import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CircleCheck, Clock3, Cpu, Download, MoreHorizontal, Pause, Play, RotateCcw, TimerReset, Workflow, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import { adminApi, AdminDataNotice, useAdminResource, type AdminJob, type AdminQueueLatency, type AdminWorkerPool } from "./_api";
import { AdminButton, AdminPageHeader, DetailGrid, Drawer, IconAction, Pagination, Panel, ProgressBar, SearchBox, Segments, Stat, StatusPill, downloadCsv, usePagination } from "./_shared";

/**
 * The queue plane, read from pg-boss.
 *
 * Every id here is a real job id, so anything shown can be found in the queue.
 * Only transfers report partial completion — pg-boss has no notion of it — so
 * other queues show a state rather than a progress bar that would have to be
 * invented to fill the column.
 *
 * The list refreshes on a timer because a queue is the one screen where a stale
 * view is actively misleading: work that finished a minute ago still looks
 * stuck.
 */

const REFRESH_MS = 5_000;

function duration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function JobsAdminPage() {
  const { data: rows, source, error, refresh } = useAdminResource<AdminJob[]>(
    "admin.jobs",
    [],
    () => adminApi.jobList(),
  );
  const [pools, setPools] = useState<AdminWorkerPool[]>([]);
  const [latency, setLatency] = useState<AdminQueueLatency[]>([]);
  const [intake, setIntake] = useState<{ paused: boolean; held: number }>({ paused: false, held: 0 });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);

  const selected = rows.find((job) => job.id === selectedId);
  const filtered = useMemo(() => rows.filter((job) => `${job.name} ${job.organization ?? ""} ${job.target ?? ""} ${job.id}`.toLowerCase().includes(query.toLowerCase()) && (tab === "all" || job.status === tab || (tab === "active" && ["running", "queued", "retrying"].includes(job.status))) && (type === "all" || job.type === type)), [query, rows, tab, type]);
  const pagination = usePagination(filtered, 7);

  const loadSidebars = useCallback(() => {
    adminApi.workerPools().then(setPools).catch(() => undefined);
    adminApi.queueLatency().then(setLatency).catch(() => undefined);
    adminApi.intake().then(setIntake).catch(() => undefined);
  }, []);

  const reload = useCallback(async () => {
    await refresh();
    loadSidebars();
  }, [loadSidebars, refresh]);

  useEffect(() => {
    if (source !== "live") return;
    loadSidebars();
  }, [loadSidebars, source]);

  // Polling stops once the view is not live, so an unauthenticated tab does not
  // sit there issuing failing requests forever.
  useEffect(() => {
    if (source !== "live") return;
    const timer = window.setInterval(() => { void reload(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload, source]);

  const failed = rows.filter((job) => job.status === "failed").length;
  const active = rows.filter((job) => ["queued", "running", "retrying"].includes(job.status)).length;
  const deadLettered = rows.filter((job) => job.deadLettered).length;
  const finished = rows.filter((job) => job.status === "complete" || job.status === "failed").length;
  const succeeded = rows.filter((job) => job.status === "complete").length;
  const oldestQueued = rows.filter((job) => job.status === "queued").at(-1);

  async function toggleIntake() {
    setBusy(true);
    try {
      const result = await adminApi.setIntake(!intake.paused);
      await reload();
      toast.warning(result.paused
        ? "Queue intake paused"
        : `Queue intake resumed${result.released ? `, ${result.released} held job${result.released === 1 ? "" : "s"} released` : ""}`);
    } catch (reason) {
      toast.error("Could not change intake", { description: reason instanceof Error ? reason.message : undefined });
    } finally { setBusy(false); }
  }

  async function retry(job: AdminJob) {
    try {
      await adminApi.retryJob(job.id);
      await reload();
      toast.success(`${job.name} requeued`);
    } catch (reason) {
      toast.error("Could not retry", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  async function cancel(job: AdminJob) {
    try {
      await adminApi.cancelJob(job.id);
      await reload();
      toast.success(`${job.name} cancelled`);
    } catch (reason) {
      toast.error("Could not cancel", { description: reason instanceof Error ? reason.message : undefined });
    }
  }

  async function retryAllFailed() {
    const targets = rows.filter((job) => job.status === "failed");
    const results = await Promise.allSettled(targets.map((job) => adminApi.retryJob(job.id)));
    const requeued = results.filter((result) => result.status === "fulfilled").length;
    await reload();
    // Reporting the count that actually succeeded, not the count attempted.
    if (requeued === targets.length) toast.success(`${requeued} failed job${requeued === 1 ? "" : "s"} requeued`);
    else toast.warning(`${requeued} of ${targets.length} requeued`, { description: "The rest could not be requeued." });
  }

  return <>
    <AdminPageHeader title="Jobs & queues" description="Operate asynchronous transfers, deployments, snapshots, and maintenance workloads across the shared worker plane." actions={<><AdminDataNotice source={source} error={error} /><AdminButton disabled={busy} onClick={() => void toggleIntake()}>{intake.paused ? <Play /> : <Pause />}{intake.paused ? "Resume intake" : "Pause intake"}</AdminButton><AdminButton variant="primary" onClick={() => void retryAllFailed()} disabled={!failed}><RotateCcw />Retry failed</AdminButton></>} />
    {intake.paused && <div className="adm-notice warning mb-3"><Pause />New jobs are being held at ingress{intake.held ? ` · ${intake.held} waiting` : ""}. Running work is not interrupted, and held jobs start when intake resumes.</div>}
    <div className="adm-stats"><Stat label="Jobs in flight" value={active} change={`${rows.filter((job) => job.status === "running").length} running`} detail="queued, running, retrying" icon={Zap} /><Stat label="Queued" value={rows.filter((job) => job.status === "queued").length} change={oldestQueued ? relativeTime(oldestQueued.createdAt) : "—"} detail="oldest wait" icon={Clock3} /><Stat label="Success rate" value={finished ? `${Math.round((succeeded / finished) * 1000) / 10}%` : "—"} change={finished ? `${finished} finished` : "no data"} detail="of the last 200 jobs" icon={CircleCheck} /><Stat label="Failed" value={failed} change={deadLettered ? `${deadLettered} dead-lettered` : "none dead-lettered"} detail="in the last 200 jobs" icon={XCircle} /></div>

    <div className="adm-grid two">
      <div>
        <div className="adm-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search job ID, resource, or organization…" /><select className="adm-select" value={type} onChange={(event) => setType(event.target.value)}><option value="all">All job types</option>{[...new Set(rows.map((job) => job.type))].map((value) => <option key={value}>{value}</option>)}</select><AdminButton size="small" variant="ghost" onClick={() => { downloadCsv("orbit-jobs.csv", filtered.map(({ id, type: kind, name, organization, target, status, attempts, durationMs, error: failure }) => ({ id, type: kind, name, organization: organization ?? "", target: target ?? "", status, attempts, durationMs: durationMs ?? "", error: failure ?? "" }))); toast.success("Job history exported"); }}><Download />Export</AdminButton></div>
        <div className="adm-panel rounded-t-none"><Segments value={tab} onChange={setTab} items={[{ value: "all", label: `ALL ${rows.length}` }, { value: "active", label: `ACTIVE ${active}` }, { value: "failed", label: `FAILED ${failed}` }, { value: "complete", label: "COMPLETE" }]} /><div className="overflow-x-auto"><table className="adm-table"><thead><tr><th>Job</th><th>State</th><th>Tenant / target</th><th>Progress</th><th>Duration</th><th>Attempts</th><th>Created</th><th /></tr></thead><tbody>
          {pagination.rows.map((job) => <tr className="clickable" key={job.id} onClick={() => setSelectedId(job.id)}><td><div className="adm-primary-cell"><span className="adm-cell-icon"><Workflow /></span><div className="adm-cell-copy"><b>{job.name}</b><small>{job.type} · <span className="adm-mono">{job.id.slice(0, 8)}</span></small></div></div></td><td><StatusPill status={job.status} /></td><td><div className="adm-cell-copy"><b>{job.organization ?? "Platform"}</b><small>{job.target ?? "—"}</small></div></td><td>{job.progress === null ? <span className="text-zinc-600">—</span> : <div style={{ width: 110 }}><ProgressBar value={job.progress} tone={job.status === "failed" ? "danger" : job.status === "retrying" ? "warning" : undefined} /></div>}</td><td className="adm-mono">{duration(job.durationMs)}</td><td className="adm-num">{job.attempts}/{job.retryLimit}</td><td>{relativeTime(job.createdAt)}</td><td><IconAction label="Inspect job" onClick={(event) => { event.stopPropagation(); setSelectedId(job.id); }}><MoreHorizontal /></IconAction></td></tr>)}
          {pagination.rows.length === 0 && <tr><td colSpan={8} className="adm-empty">{source === "loading" ? "Loading jobs…" : "No jobs match this view."}</td></tr>}
        </tbody></table></div><Pagination {...pagination} onPage={pagination.setPage} /></div>
      </div>
      <div className="adm-grid">
        <Panel title="Worker pools" description="Concurrency per queue in one worker process" action={<StatusPill status={pools.some((pool) => pool.load > 100) ? "warning" : "healthy"} label={`${pools.reduce((sum, pool) => sum + pool.capacity, 0)} slots`} />} bodyClassName="flush"><ul className="adm-list">{pools.filter((pool) => pool.active || pool.queued || pool.capacity > 1).map((pool) => <li className="adm-list-item" key={pool.name}><Cpu /><div className="adm-list-copy"><b>{pool.name}</b><small>{pool.active} active / {pool.capacity} slots · {pool.queued} queued</small></div><div style={{ width: 75 }}><ProgressBar value={Math.min(pool.load, 100)} tone={pool.load > 80 ? "warning" : undefined} /></div></li>)}{pools.length === 0 && <li className="adm-list-item"><Cpu /><div className="adm-list-copy"><b>No pool data</b><small>The queue has not reported yet.</small></div></li>}</ul></Panel>
        <Panel title="Queue latency" description="P95 wait from created to started, last 24 hours">{latency.map((entry) => <div className="adm-kpi-row" key={entry.queue}><span>{entry.queue}</span><span className={entry.p95Seconds > 10 ? "adm-stat-change down" : undefined}>{entry.p95Seconds < 1 ? `${Math.round(entry.p95Seconds * 1000)} ms` : `${entry.p95Seconds.toFixed(1)} sec`}</span></div>)}{latency.length === 0 && <div className="adm-kpi-row"><span>No jobs started in the last 24 hours</span><span>—</span></div>}</Panel>
        <Panel title="Dead-letter queue" description="Workloads requiring operator review"><div className="flex items-center justify-between"><div><strong className="text-xl">{deadLettered}</strong><p className="text-[8px] text-zinc-500 mt-1">{deadLettered ? "Exhausted every retry" : "Nothing has exhausted its retries"}</p></div><AdminButton size="small" disabled={!deadLettered} onClick={() => { setTab("failed"); setQuery(""); }}>Review payloads</AdminButton></div></Panel>
      </div>
    </div>

    <Drawer open={Boolean(selected)} onClose={() => setSelectedId(undefined)} title={selected?.name ?? "Job"} description={selected ? `${selected.type} · ${selected.id}` : undefined} footer={selected && <>{["failed", "cancelled"].includes(selected.status) && <AdminButton onClick={() => void retry(selected)}><RotateCcw />Retry job</AdminButton>}{["running", "queued", "retrying"].includes(selected.status) && <AdminButton variant="danger" onClick={() => void cancel(selected)}><Ban />Cancel job</AdminButton>}</>}>
      {selected && <><div className="flex items-center justify-between mb-4"><StatusPill status={selected.status} /><span className="adm-mono">attempt {selected.attempts} of {selected.retryLimit}</span></div>{selected.progress !== null && <ProgressBar value={selected.progress} tone={selected.status === "failed" ? "danger" : undefined} />}<p className="adm-section-label">Execution context</p><DetailGrid items={[["Organization", selected.organization ?? "Platform"], ["Target", selected.target ?? "—"], ["Queue", selected.type], ["Duration", duration(selected.durationMs)], ["Created", relativeTime(selected.createdAt)], ["Dead-lettered", selected.deadLettered ? "Yes" : "No"]]} /><p className="adm-section-label">Event timeline</p><ul className="adm-list border border-white/10 rounded-md">{([["Accepted at ingress", selected.createdAt], selected.startedAt ? ["Claimed by a worker", selected.startedAt] : ["Waiting for an available worker", null], selected.completedAt ? [selected.status === "failed" ? "Worker reported a failure" : "Finished", selected.completedAt] : null] as Array<[string, string | null] | null>).filter(Boolean).map((entry, index) => <li className="adm-list-item" key={index}><TimerReset /><div className="adm-list-copy"><b>{entry![0]}</b><small>{entry![1] ? relativeTime(entry![1]!) : "not yet"}</small></div></li>)}</ul>{selected.error && <><p className="adm-section-label">Failure</p><pre className="adm-code">{selected.error}</pre></>}</>}
    </Drawer>
  </>;
}

export default JobsAdminPage;
