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
export function useLiveResource<T>(empty: T, loader: () => Promise<T>) {
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
  }, [refresh]);

  // `live` is retained so existing call sites keep compiling; every session is
  // live now, so it is always true.
  return { data, setData, loading, error, live: true as const, refresh };
}
