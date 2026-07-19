import { AlertTriangle, Eye, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceDataStatus({ live, loading, error, onRetry, className }: { live: boolean; loading?: boolean; error?: string; onRetry?: () => void; className?: string }) {
  if (!live) {
    return <div className={cn("flex items-center gap-2 rounded-lg border border-sky-400/15 bg-sky-400/[0.045] px-3 py-2 text-[10px] text-sky-200/70", className)}><Eye className="size-3.5" />Preview data is shown. Sign in to manage your live workspace.</div>;
  }
  if (error) {
    return <div className={cn("flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-[10px] text-rose-200/80", className)}><AlertTriangle className="size-3.5" /><span className="min-w-0 flex-1 truncate">Live data unavailable: {error}</span>{onRetry ? <button type="button" className="inline-flex items-center gap-1 text-rose-100 hover:text-white" onClick={onRetry}><RefreshCw className="size-3" />Retry</button> : null}</div>;
  }
  if (loading) {
    return <div className={cn("flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] text-zinc-500", className)}><RefreshCw className="size-3.5 animate-spin" />Loading live workspace data…</div>;
  }
  return null;
}
