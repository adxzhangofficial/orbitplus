import { cn } from "@/lib/utils";

/**
 * Presentation for values that may not have been measured.
 *
 * These existed as `?? 0` at a dozen call sites, which rendered a server nobody
 * had measured as one sitting perfectly idle. A metric is either a number or
 * absent, and absent has to look different from zero.
 */

export function MetricValue({ value, suffix = "%", className }: { value: number | null; suffix?: string; className?: string }) {
  if (value === null) return <span className={cn("text-zinc-600", className)}>—</span>;
  return <span className={className}>{Math.round(value)}{suffix}</span>;
}

/** Bar that reads as empty and muted when there is nothing to show. */
export function MetricBar({ value }: { value: number | null }) {
  const measured = value !== null;
  const tone = !measured ? "bg-zinc-800"
    : value > 85 ? "bg-rose-400"
    : value > 65 ? "bg-amber-400"
    : "bg-emerald-400";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: measured ? `${Math.min(100, value)}%` : "100%", opacity: measured ? 1 : 0.25 }} />
    </div>
  );
}

export type ConnectionState = "online" | "degraded" | "offline" | "checking" | "unknown";

/**
 * The dot next to a server's name.
 *
 * Distinguishes "reachable", "reachable but something is wrong", "unreachable",
 * and "never checked". The last two looked identical before, so a server that
 * had simply never been probed appeared to be down.
 */
export function StatusDot({ state, label, showLabel = true }: { state: ConnectionState; label?: string; showLabel?: boolean }) {
  const config: Record<ConnectionState, { dot: string; text: string; ring: string; word: string }> = {
    online: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-400/20", word: "Online" },
    degraded: { dot: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-400/20", word: "Degraded" },
    offline: { dot: "bg-rose-400", text: "text-rose-300", ring: "ring-rose-400/20", word: "Offline" },
    checking: { dot: "bg-sky-400", text: "text-sky-300", ring: "ring-sky-400/20", word: "Checking" },
    unknown: { dot: "bg-zinc-600", text: "text-zinc-500", ring: "ring-white/10", word: "Not checked" },
  };
  const style = config[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] ring-1", style.ring, style.text)}>
      <span className={cn("size-1.5 rounded-full", style.dot, state === "checking" && "animate-pulse")} />
      {showLabel && (label ?? style.word)}
    </span>
  );
}

/**
 * Maps a stored connection status and the age of its last sample to a state.
 *
 * A reading nobody has refreshed in ten minutes is reported as stale rather
 * than presented as current, because a frozen number that looks live is worse
 * than an obviously missing one.
 */
export function connectionState(status: string | null | undefined, lastCheckedAt: string | null | undefined): ConnectionState {
  if (!lastCheckedAt) return "unknown";
  const ageMs = Date.now() - new Date(lastCheckedAt).getTime();
  if (ageMs > 10 * 60_000) return "unknown";
  if (status === "online" || status === "healthy") return "online";
  if (status === "degraded" || status === "warning") return "degraded";
  if (status === "offline" || status === "critical") return "offline";
  return "checking";
}
