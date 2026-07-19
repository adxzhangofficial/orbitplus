import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, Play, Plus, SearchX, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import { buttonClass, controlClass, EmptyState, IconButton, Modal, PageHeader, Panel, primaryButtonClass, SearchField, Stat, StatusBadge } from "./_shared";

/**
 * Saved, reviewable command sequences.
 *
 * This page previously listed sample runbooks whose Run button showed a toast.
 * Nothing was stored and no command ever reached a server. Steps are now
 * executed over SSH in order, and each run records what every step produced.
 */

interface Step { name: string; command: string; continueOnError?: boolean }

interface Runbook {
  id: string;
  name: string;
  description: string;
  steps: Step[];
  requiredRole: "developer" | "admin" | "owner";
  runCount: number;
  lastRunAt: string | null;
  createdByName: string | null;
  updatedAt: string;
}

interface StepResult {
  name: string; command: string; exitCode: number | null;
  stdout: string; stderr: string; durationMs: number;
  skipped?: boolean; refusedReason?: string;
}

interface RunRecord {
  id: string; status: string; results: StepResult[]; errorMessage: string | null;
  startedAt: string; finishedAt: string | null; serverName: string | null; userName: string | null;
}

interface ServerOption { id: string; name: string; adapterMode: string }

const BLANK: Step = { name: "", command: "", continueOnError: false };

export function RunbooksPage() {
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string>();
  const [runOutput, setRunOutput] = useState<{ name: string; results: StepResult[]; status: string }>();
  const [history, setHistory] = useState<{ id: string; rows: RunRecord[] }>();
  const [draft, setDraft] = useState<{ name: string; description: string; requiredRole: Runbook["requiredRole"]; steps: Step[] }>({
    name: "", description: "", requiredRole: "developer", steps: [{ ...BLANK }],
  });
  const [target, setTarget] = useState("");

  async function load() {
    try {
      const [books, serverRows] = await Promise.all([
        api.get<Runbook[]>("/runbooks"),
        api.get<ServerOption[]>("/servers?limit=100"),
      ]);
      setRunbooks(books);
      const usable = serverRows.filter((server) => server.adapterMode === "sftp");
      setServers(usable);
      setTarget((current) => current || usable[0]?.id || "");
    } catch (error) {
      toast.error("Could not load runbooks", { description: error instanceof Error ? error.message : undefined });
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => runbooks.filter((book) => `${book.name} ${book.description}`.toLowerCase().includes(query.toLowerCase())),
    [runbooks, query],
  );

  async function save() {
    const steps = draft.steps.filter((step) => step.name.trim() && step.command.trim());
    if (!draft.name.trim() || steps.length === 0) {
      toast.error("Give the runbook a name and at least one complete step");
      return;
    }
    setSaving(true);
    try {
      await api.post("/runbooks", { name: draft.name.trim(), description: draft.description.trim(), steps, requiredRole: draft.requiredRole });
      setEditorOpen(false);
      setDraft({ name: "", description: "", requiredRole: "developer", steps: [{ ...BLANK }] });
      toast.success("Runbook saved");
      await load();
    } catch (error) {
      toast.error("Could not save", { description: error instanceof Error ? error.message : undefined });
    } finally { setSaving(false); }
  }

  async function run(book: Runbook) {
    if (!target) { toast.error("Connect a server before running a runbook"); return; }
    setRunning(book.id);
    setRunOutput(undefined);
    try {
      const result = await api.post<{ status: string; results: StepResult[] }>(`/runbooks/${book.id}/run`, { serverId: target });
      setRunOutput({ name: book.name, results: result.results, status: result.status });
      if (result.status === "succeeded") toast.success(`${book.name} completed`);
      else toast.error(`${book.name} failed`, { description: "Check the step output below." });
      await load();
    } catch (error) {
      // A failed procedure still returns its partial results, so the message
      // here is for a request that never ran at all.
      toast.error("Could not run", { description: error instanceof Error ? error.message : undefined });
    } finally { setRunning(undefined); }
  }

  async function remove(book: Runbook) {
    if (!window.confirm(`Delete "${book.name}"? Its run history is deleted too.`)) return;
    try {
      await api.delete(`/runbooks/${book.id}`);
      toast.success("Runbook deleted");
      await load();
    } catch (error) {
      toast.error("Could not delete", { description: error instanceof Error ? error.message : undefined });
    }
  }

  async function showHistory(book: Runbook) {
    try {
      setHistory({ id: book.id, rows: await api.get<RunRecord[]>(`/runbooks/${book.id}/runs`) });
    } catch (error) {
      toast.error("Could not load history", { description: error instanceof Error ? error.message : undefined });
    }
  }

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Operations"
      title="Runbooks"
      description="Saved procedures that run the same way every time, with a record of who ran them and what each step produced."
      actions={<>
        {servers.length > 0 && (
          <select value={target} onChange={(event) => setTarget(event.target.value)} className={controlClass}>
            {servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}
          </select>
        )}
        <button className={primaryButtonClass} onClick={() => setEditorOpen(true)}><Plus className="size-3.5" />New runbook</button>
      </>}
    />

    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Runbooks" value={runbooks.length} detail="Saved procedures" icon={BookOpenCheck} />
      <Stat label="Total runs" value={runbooks.reduce((sum, book) => sum + Number(book.runCount ?? 0), 0)} detail="All time" icon={Play} tone="sky" />
      <Stat label="Target" value={servers.find((server) => server.id === target)?.name ?? "None"} detail={servers.length ? "Runs execute here" : "Connect a server"} icon={CheckCircle2} tone={servers.length ? "emerald" : "amber"} />
    </div>

    {runOutput && (
      <Panel
        title={`${runOutput.name} · ${runOutput.status}`}
        description="Output from the most recent run"
        actions={<button className={buttonClass} onClick={() => setRunOutput(undefined)}>Dismiss</button>}
        flush
      >
        <div className="divide-y divide-border">
          {runOutput.results.map((result, index) => <div key={index} className="px-4 py-3">
            <div className="flex items-center gap-2">
              {result.skipped
                ? <span className="text-[10px] text-muted-foreground">skipped</span>
                : result.refusedReason
                  ? <XCircle className="size-3.5 text-rose-400" />
                  : result.exitCode === 0
                    ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                    : <XCircle className="size-3.5 text-rose-400" />}
              <p className="text-xs font-medium text-foreground">{result.name}</p>
              {!result.skipped && !result.refusedReason && (
                <span className="text-[9px] text-muted-foreground">exit {result.exitCode} · {result.durationMs} ms</span>
              )}
            </div>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground">$ {result.command}</p>
            {result.refusedReason && (
              <p className="mt-2 rounded-md border border-rose-400/15 bg-rose-400/[0.04] p-2 text-[9px] text-rose-200/90">
                Refused: {result.refusedReason}. This command was not sent.
              </p>
            )}
            {(result.stdout || result.stderr) && (
              <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-black/30 p-2 font-mono text-[9px] leading-4 text-zinc-400">
                {result.stdout}{result.stderr}
              </pre>
            )}
          </div>)}
        </div>
      </Panel>
    )}

    <Panel title="Your runbooks" description="Steps run in order over one SSH connection" flush>
      <div className="border-b border-border p-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search runbooks" />
      </div>
      {loading
        ? <p className="p-6 text-center text-[10px] text-muted-foreground">Loading…</p>
        : filtered.length
          ? <div className="divide-y divide-border">
              {filtered.map((book) => <div key={book.id} className="px-4 py-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_130px_150px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium text-foreground">{book.name}</p>
                      <StatusBadge status="active">{book.requiredRole}</StatusBadge>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">{book.description || `${book.steps.length} steps`}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{book.steps.length} step{book.steps.length === 1 ? "" : "s"}</span>
                  <button type="button" onClick={() => void showHistory(book)} className="text-left text-[10px] text-muted-foreground hover:text-foreground">
                    {book.lastRunAt ? `Last ${relativeTime(book.lastRunAt)}` : "Never run"}
                    <span className="mt-1 block underline decoration-dotted">{book.runCount} run{Number(book.runCount) === 1 ? "" : "s"}</span>
                  </button>
                  <div className="flex justify-end gap-1.5">
                    <button className={primaryButtonClass} disabled={running === book.id || !target} onClick={() => void run(book)}>
                      <Play className="size-3" />{running === book.id ? "Running…" : "Run"}
                    </button>
                    <IconButton title="Delete" onClick={() => void remove(book)}><Trash2 className="size-3.5" /></IconButton>
                  </div>
                </div>

                <ol className="mt-3 space-y-1">
                  {book.steps.map((step, index) => <li key={index} className="flex items-baseline gap-2 text-[9px]">
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <span className="text-zinc-400">{step.name}</span>
                    <code className="truncate font-mono text-muted-foreground">{step.command}</code>
                  </li>)}
                </ol>

                {history?.id === book.id && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    {history.rows.length === 0
                      ? <p className="p-3 text-[9px] text-muted-foreground">No runs yet</p>
                      : history.rows.slice(0, 6).map((record) => <div key={record.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-[9px] last:border-0">
                          <span className={record.status === "succeeded" ? "text-emerald-300" : "text-rose-300"}>{record.status}</span>
                          <span className="text-muted-foreground">{record.serverName} · {record.userName}</span>
                          <span className="text-muted-foreground">{relativeTime(record.startedAt)}</span>
                        </div>)}
                  </div>
                )}
              </div>)}
            </div>
          : <EmptyState icon={SearchX} title="No runbooks yet" description="Write down a procedure once so it runs the same way every time." />}
    </Panel>

    <Modal
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      title="New runbook"
      description="Steps run in order. A failing step stops the run unless you allow it to continue."
      wide
      footer={<>
        <button className={buttonClass} onClick={() => setEditorOpen(false)}>Cancel</button>
        <button className={primaryButtonClass} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save runbook"}</button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted-foreground">
            Name
            <input autoFocus className={cn(controlClass, "mt-1.5 w-full")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Restart the API" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Minimum role
            <select className={cn(controlClass, "mt-1.5 w-full")} value={draft.requiredRole} onChange={(event) => setDraft({ ...draft, requiredRole: event.target.value as Runbook["requiredRole"] })}>
              <option value="developer">Developer</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Description
          <input className={cn(controlClass, "mt-1.5 w-full")} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What this procedure does and when to use it" />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Steps</p>
            <button type="button" className={buttonClass} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { ...BLANK }] })}>
              <Plus className="size-3" />Add step
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {draft.steps.map((step, index) => <div key={index} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                <input
                  className={cn(controlClass, "min-w-0 flex-1")}
                  value={step.name}
                  onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((item, at) => at === index ? { ...item, name: event.target.value } : item) })}
                  placeholder="Step name"
                />
                {draft.steps.length > 1 && (
                  <IconButton title="Remove step" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, at) => at !== index) })}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                )}
              </div>
              <input
                className={cn(controlClass, "mt-2 w-full font-mono")}
                value={step.command}
                onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((item, at) => at === index ? { ...item, command: event.target.value } : item) })}
                placeholder="systemctl restart api"
              />
              <label className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(step.continueOnError)}
                  onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((item, at) => at === index ? { ...item, continueOnError: event.target.checked } : item) })}
                  className="size-3 accent-blue-500"
                />
                Continue even if this step fails
              </label>
            </div>)}
          </div>
        </div>
      </div>
    </Modal>
  </div>;
}

export default RunbooksPage;
