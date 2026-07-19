import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Step-by-step feedback for connecting a server.
 *
 * Saving a connection ran four requests in sequence and rendered nothing until
 * the last one settled, so a flow that legitimately takes ten or more seconds
 * looked frozen and then produced a toast out of nowhere. Each step is now
 * announced before it runs and resolved as it finishes, which also means a
 * failure points at the stage that actually failed instead of at "save".
 */

export type StepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface ProgressStep {
  id: string;
  label: string;
  /** Present once the step has settled: latency, entry counts, a reason. */
  detail?: string;
  state: StepState;
}

export function useConnectionProgress() {
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [running, setRunning] = useState(false);
  // Read inside async callbacks that must not close over a stale array.
  const stepsRef = useRef<ProgressStep[]>([]);
  stepsRef.current = steps;

  const begin = useCallback((initial: Array<Pick<ProgressStep, "id" | "label">>) => {
    const next = initial.map((step) => ({ ...step, state: "pending" as StepState }));
    stepsRef.current = next;
    setSteps(next);
    setRunning(true);
  }, []);

  const update = useCallback((id: string, state: StepState, detail?: string) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, state, detail } : step)));
  }, []);

  const finish = useCallback(() => setRunning(false), []);

  const reset = useCallback(() => {
    stepsRef.current = [];
    setSteps([]);
    setRunning(false);
  }, []);

  /**
   * Runs one step, marking it running before and settling it after.
   *
   * A thrown error marks the step failed and propagates, so the caller decides
   * whether the sequence can continue. Steps that are useful but not required,
   * like installing the agent, pass `optional` and record their reason instead
   * of aborting the connection.
   */
  const run = useCallback(async <T,>(
    id: string,
    task: () => Promise<T>,
    options: { detail?: (result: T) => string; optional?: boolean } = {},
  ): Promise<T | undefined> => {
    update(id, "running");
    try {
      const result = await task();
      update(id, "done", options.detail?.(result));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed";
      if (options.optional) {
        update(id, "skipped", message);
        return undefined;
      }
      update(id, "failed", message);
      throw error;
    }
  }, [update]);

  return { steps, running, begin, update, run, finish, reset };
}

export function ConnectionProgress({ steps, className }: { steps: ProgressStep[]; className?: string }) {
  if (steps.length === 0) return null;
  return (
    <ol className={cn("space-y-1.5", className)}>
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2.5">
          <StepIcon state={step.state} />
          <div className="min-w-0 flex-1 pt-px">
            <p className={cn(
              "text-[10px] leading-4 transition-colors",
              step.state === "pending" && "text-zinc-600",
              step.state === "running" && "text-zinc-200",
              step.state === "done" && "text-zinc-400",
              step.state === "failed" && "text-rose-300",
              step.state === "skipped" && "text-amber-300",
            )}>
              {step.label}
              {step.state === "running" && <span className="ml-1 text-zinc-500">…</span>}
            </p>
            {step.detail && (
              <p className={cn(
                "mt-0.5 break-words text-[9px] leading-4",
                step.state === "failed" ? "text-rose-400/80" : step.state === "skipped" ? "text-amber-400/70" : "text-zinc-600",
              )}>
                {step.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "running") return <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-sky-300" />;
  if (state === "done") return <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />;
  if (state === "failed") return <AlertTriangle className="mt-0.5 size-3 shrink-0 text-rose-400" />;
  if (state === "skipped") return <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />;
  return <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-zinc-700" />;
}
