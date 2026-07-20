import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async action once at a time.
 *
 * Buttons wired straight to an async handler had two problems that compounded
 * each other. Nothing on screen changed while the request was in flight, so a
 * click looked like it had missed; and clicking again started a second request,
 * so both eventually finished and reported success. On a remote server where a
 * call takes the better part of a second, that reads as "nothing happened,
 * nothing happened, everything happened four times".
 *
 * The guard is a ref rather than the state flag, and that is the whole point:
 * setState is asynchronous, so two clicks in the same tick would both observe
 * `pending === false` and both proceed. The ref updates synchronously, so the
 * second click sees the first and returns.
 *
 * The returned flag exists for the button, which should say it is working.
 * Preventing the duplicate is not enough on its own — without visible feedback
 * the person still has no reason to believe the first click landed.
 */
export function useAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
): readonly [(...args: Args) => Promise<void>, boolean] {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);

  // Held in a ref so the returned function keeps a stable identity even when
  // the caller passes an inline closure, which is the normal way to write one.
  const latest = useRef(action);
  latest.current = action;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (...args: Args) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      await latest.current(...args);
    } catch (error) {
      // Handlers report their own failures to the user, so this is only
      // reached when one throws unexpectedly. Every call site invokes this as
      // `void run()`, so re-throwing would become an unhandled rejection —
      // noise that hides the actual fault rather than surfacing it. Logging
      // keeps a genuine bug visible without pretending to know how this
      // particular screen should present it.
      console.error("An action failed without handling its own error", error);
    } finally {
      running.current = false;
      // An action that navigates away or closes the panel it lives in unmounts
      // this component before finishing; setting state then is a no-op React
      // warns about.
      if (mounted.current) setPending(false);
    }
  }, []);

  return [run, pending] as const;
}
