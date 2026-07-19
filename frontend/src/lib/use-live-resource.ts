import { useCallback, useEffect, useRef, useState } from "react";

export function hasWorkspaceAccessToken() {
  return Boolean(localStorage.getItem("orbit.accessToken"));
}

/**
 * Loads a workspace resource from the API.
 *
 * There is no preview or demo branch. Every page shows what the server
 * actually returns, an empty state, or an error. Substituting invented data
 * when a request failed made a broken backend look like a working product and
 * hid real failures from whoever was testing.
 */
/**
 * @param pollMs re-fetches on an interval so a page tracks background work
 *   without the user reloading. Omit for data that only changes when the user
 *   acts on it.
 */
export function useLiveResource<T>(empty: T, loader: () => Promise<T>, pollMs?: number) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await loaderRef.current();
      setData(next);
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load workspace data";
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    if (!pollMs) return;
    // Silent: a failed poll leaves the previous data on screen rather than
    // replacing a working view with an error.
    const timer = setInterval(() => { void refresh().catch(() => undefined); }, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  // `live` is retained so existing call sites keep compiling; every session is
  // live now, so it is always true.
  return { data, setData, loading, error, live: true as const, refresh };
}
