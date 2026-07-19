import { useCallback, useEffect, useRef, useState } from "react";

export function hasWorkspaceAccessToken() {
  return Boolean(localStorage.getItem("orbit.accessToken"));
}

export function useLiveResource<T>(preview: T, empty: T, loader: () => Promise<T>) {
  const live = hasWorkspaceAccessToken();
  const loaderRef = useRef(loader);
  const previewRef = useRef(preview);
  loaderRef.current = loader;
  previewRef.current = preview;
  const [data, setData] = useState<T>(() => live ? empty : preview);
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!live) {
      setData(previewRef.current);
      setError(undefined);
      return previewRef.current;
    }
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
  }, [live]);

  useEffect(() => {
    if (!live) return;
    void refresh().catch(() => undefined);
  }, [live, refresh]);

  return { data, setData, loading, error, live, refresh };
}
