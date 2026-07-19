import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";

/**
 * Agent state for one server, with the controls to install or remove it.
 *
 * The agent is installed automatically when a server is connected, but that can
 * fail for reasons the customer needs to see and act on: a non-root user, a
 * host without curl, or a deployment address the server cannot reach. Without
 * this panel a failed install was invisible and resource metrics were simply
 * missing forever with no explanation.
 */

interface AgentStatus {
  status: "none" | "pending" | "active" | "stale" | "revoked";
  hostname?: string | null;
  platform?: string | null;
  agentVersion?: string | null;
  lastReportAt?: string | null;
  reportsReceived?: number | string;
  lastError?: string | null;
  deploymentReachable?: boolean;
  deploymentReason?: string;
}

const LABELS: Record<AgentStatus["status"], { text: string; tone: string }> = {
  active: { text: "Installed and reporting", tone: "text-emerald-300" },
  stale: { text: "Installed but not reporting", tone: "text-amber-300" },
  pending: { text: "Not installed", tone: "text-zinc-400" },
  revoked: { text: "Removed", tone: "text-zinc-500" },
  none: { text: "Not installed", tone: "text-zinc-400" },
};

export function AgentPanel({ serverId }: { serverId: string }) {
  const [agent, setAgent] = useState<AgentStatus>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAgent(await api.get<AgentStatus>(`/servers/${serverId}/agent`)); }
    catch { /* leave the previous state rather than blanking the panel */ }
  }, [serverId]);

  useEffect(() => {
    void load();
    // Follows an install that is running on the queue.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function install() {
    setBusy(true);
    try {
      await api.post(`/servers/${serverId}/agent/install`, {});
      toast.success("Installing the agent", { description: "This takes a few seconds. The panel updates when it finishes." });
      // Polled rather than awaited: the install runs on the queue.
      setTimeout(() => void load(), 4000);
    } catch (error) {
      toast.error("Could not start the install", { description: error instanceof Error ? error.message : undefined });
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/servers/${serverId}/agent`);
      toast.success("Agent removed", { description: "Its token is revoked, so any copy still running is refused." });
      await load();
    } catch (error) {
      toast.error("Could not remove the agent", { description: error instanceof Error ? error.message : undefined });
    } finally { setBusy(false); }
  }

  if (!agent) return null;
  const label = LABELS[agent.status] ?? LABELS.none;
  const installed = agent.status === "active" || agent.status === "stale";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {installed
            ? <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${agent.status === "active" ? "text-emerald-400" : "text-amber-400"}`} />
            : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-zinc-600" />}
          <div>
            <p className="text-xs font-medium">Read-only agent</p>
            <p className={`mt-0.5 text-[10px] ${label.tone}`}>{label.text}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => void load()} className="grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300" title="Refresh">
            <RefreshCw className="size-3" />
          </button>
          {installed
            ? <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 py-1 text-[10px] text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50">
                <Trash2 className="size-3" />Remove
              </button>
            : <button type="button" disabled={busy || agent.deploymentReachable === false} onClick={() => void install()} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[10px] font-medium text-black hover:bg-zinc-200 disabled:opacity-40">
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}Install
              </button>}
        </div>
      </div>

      {installed && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-[9px]">
          {[
            ["Host", agent.hostname],
            ["Platform", agent.platform],
            ["Version", agent.agentVersion],
            ["Last report", agent.lastReportAt ? relativeTime(agent.lastReportAt) : "never"],
            ["Reports", String(agent.reportsReceived ?? 0)],
          ].filter(([, value]) => value).map(([term, value]) => (
            <div key={term as string}>
              <dt className="text-zinc-600">{term}</dt>
              <dd className="mt-0.5 truncate text-zinc-300">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Reported before any install error: where the deployment itself is
          unreachable no install can succeed, and the address is the cause. */}
      {agent.deploymentReachable === false && (
        <p className="mt-3 rounded-md border border-amber-400/15 bg-amber-400/[0.04] p-2.5 text-[9px] leading-4 text-amber-200/90">
          {agent.deploymentReason}
        </p>
      )}
      {agent.deploymentReachable !== false && agent.lastError && (
        <p className="mt-3 rounded-md border border-rose-400/15 bg-rose-400/[0.04] p-2.5 text-[9px] leading-4 text-rose-200/90">
          {agent.lastError}
        </p>
      )}
      {!installed && agent.deploymentReachable !== false && !agent.lastError && (
        <p className="mt-3 text-[9px] leading-4 text-zinc-600">
          The agent reports CPU, memory, and disk, which SFTP cannot read. It sends only; it accepts no commands and opens no port.
        </p>
      )}
    </div>
  );
}
