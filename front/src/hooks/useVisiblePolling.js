import { useCallback, useEffect, useRef } from "react";

export function useVisiblePolling(load, { enabled = true, intervalMs = 10_000 } = {}) {
  const refreshRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let busy = false;
    let refreshQueued = false;

    async function refresh() {
      if (document.hidden || busy || controller.signal.aborted) return;
      busy = true;
      try {
        await load(controller.signal);
      } finally {
        busy = false;
        if (refreshQueued) {
          refreshQueued = false;
          void refresh();
        }
      }
    }

    refreshRef.current = () => {
      if (busy) {
        refreshQueued = true;
        return;
      }
      return refresh();
    };
    refresh();
    const interval = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      refreshRef.current = null;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, intervalMs, load]);

  return useCallback(() => refreshRef.current?.(), []);
}
