import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Public status.
 *
 * This page previously displayed invented uptime percentages, a fabricated
 * ninety-day history, and a green banner regardless of what was happening. A
 * status page that reports healthy during an outage is worse than none at all,
 * because an outage is exactly when people check it. Every figure here is
 * measured by the API at the moment of the request.
 */

interface Component {
  name: string;
  status: "operational" | "degraded" | "down";
  detail: string;
  latencyMs?: number;
}

interface StatusPayload {
  status: "operational" | "degraded" | "down";
  components: Component[];
  checks: { last24hSuccessRate: number | null; sampleCount: number };
  measuredAt: string;
}

const TONE: Record<Component["status"], { icon: typeof CheckCircle2; text: string; dot: string; label: string }> = {
  operational: { icon: CheckCircle2, text: "text-emerald-300", dot: "bg-emerald-400", label: "Operational" },
  degraded: { icon: AlertTriangle, text: "text-amber-300", dot: "bg-amber-400", label: "Degraded" },
  down: { icon: XCircle, text: "text-rose-300", dot: "bg-rose-400", label: "Down" },
};

export function StatusPage() {
  const [status, setStatus] = useState<StatusPayload>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<StatusPayload>("/status"));
      setError(undefined);
    } catch (cause) {
      // A failed fetch is itself a signal: if this page cannot reach the API,
      // saying so is more accurate than leaving the last good reading on screen.
      setError(cause instanceof Error ? cause.message : "Cannot reach the Orbit API");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const headline = error ? TONE.down : status ? TONE[status.status] : TONE.operational;
  const HeadlineIcon = headline.icon;

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <header className="text-center">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Orbit+ status</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <HeadlineIcon className={cn("size-7", headline.text)} />
          <h1 className="font-heading text-2xl tracking-tight text-foreground sm:text-3xl">
            {error ? "Status unavailable"
              : status?.status === "operational" ? "All systems operational"
              : status?.status === "degraded" ? "Degraded performance"
              : status ? "Service disruption" : "Checking…"}
          </h1>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {error
            ? error
            : status
              ? `Measured ${new Date(status.measuredAt).toLocaleTimeString()} · refreshes every 30 seconds`
              : "Contacting the API"}
        </p>
      </header>

      <section className="mt-10 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-xs font-medium text-foreground">Components</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />Refresh
          </button>
        </div>

        {error ? (
          <p className="p-6 text-center text-[11px] text-muted-foreground">
            The status API could not be reached, so component health is unknown. This page does not guess.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {(status?.components ?? []).map((component) => {
              const tone = TONE[component.status];
              return (
                <div key={component.name} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("size-1.5 rounded-full", tone.dot)} />
                    <div>
                      <p className="text-xs text-foreground">{component.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{component.detail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {component.latencyMs !== undefined && (
                      <span className="font-mono text-[10px] text-muted-foreground">{component.latencyMs} ms</span>
                    )}
                    <span className={cn("text-[10px]", tone.text)}>{tone.label}</span>
                  </div>
                </div>
              );
            })}
            {!loading && (status?.components.length ?? 0) === 0 && (
              <p className="p-6 text-center text-[11px] text-muted-foreground">No components reported</p>
            )}
          </div>
        )}
      </section>

      {status && !error && (
        <section className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-medium text-foreground">Connection checks, last 24 hours</h2>
            <Badge tone={status.checks.last24hSuccessRate === null ? "neutral" : status.checks.last24hSuccessRate >= 99 ? "success" : "warning"}>
              {status.checks.last24hSuccessRate === null ? "No data" : `${status.checks.last24hSuccessRate}%`}
            </Badge>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            {status.checks.sampleCount === 0
              // Reporting 100% from zero measurements would be the same lie in
              // a different form.
              ? "No probes have run in the last 24 hours, so there is nothing to report."
              : `From ${status.checks.sampleCount.toLocaleString()} probes against connected servers. This measures reachability from Orbit's workers, not the availability of any individual server.`}
          </p>
        </section>
      )}

      <p className="mt-8 text-center text-[10px] leading-4 text-muted-foreground">
        Every value on this page is measured when the page loads. Nothing here is precomputed or asserted.
      </p>
    </div>
  );
}

export default StatusPage;
