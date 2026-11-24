import { useEffect, useRef } from "react";

import { markChatRead } from "../../api/chat.js";

export function useMarkChatRead(partnerId, messageId, enabled, onRead) {
  const target = useRef(null);
  const readThrough = useRef(0);

  useEffect(() => {
    if (!enabled || !target.current || messageId <= readThrough.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    let visible = false;
    let sending = false;
    let retry;

    async function markVisibleMessage() {
      if (!visible || document.hidden || sending || signal.aborted || messageId <= readThrough.current) return;
      window.clearTimeout(retry);
      sending = true;
      try {
        await markChatRead(partnerId, messageId, signal);
        if (signal.aborted) return;
        readThrough.current = messageId;
        onRead();
      } catch {
        if (!signal.aborted) retry = window.setTimeout(markVisibleMessage, 10_000);
      } finally {
        sending = false;
      }
    }

    // The viewport intersection also accounts for clipping by the message list.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio > 0;
      markVisibleMessage();
    }, { threshold: [0, 0.01] });
    observer.observe(target.current);
    document.addEventListener("visibilitychange", markVisibleMessage);
    return () => {
      controller.abort();
      observer.disconnect();
      document.removeEventListener("visibilitychange", markVisibleMessage);
      window.clearTimeout(retry);
    };
  }, [enabled, messageId, onRead, partnerId]);

  return target;
}
