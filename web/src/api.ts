import { useEffect, useState } from "react";

export interface ApiState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

/**
 * GET a JSON API path. Refetches when the path changes, and whenever the page
 * becomes visible again, so coming back to the app shows new captures.
 */
export function useApi<T>(path: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T> & { path?: string }>({ loading: true });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    getJson<T>(path, controller.signal).then(
      (data) => setState({ path, data, loading: false }),
      (err: Error) => {
        if (!controller.signal.aborted) setState({ path, error: err.message, loading: false });
      },
    );
    return () => controller.abort();
  }, [path, refresh]);

  // Data fetched for another path is stale: never show one category's entries on another's page.
  return state.path === path ? state : { loading: true };
}
