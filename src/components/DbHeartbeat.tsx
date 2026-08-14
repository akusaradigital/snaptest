"use client";

import { useEffect } from "react";

const PING_INTERVAL_MS = 4 * 60 * 1000;

// Keeps the Neon compute warm only while a user actually has the tab open and
// visible, so free-tier compute-hours are spent on real usage, not idle time.
export default function DbHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      fetch("/api/health", { cache: "no-store" }).catch(() => {});
    };

    const start = () => {
      if (timer) return;
      ping();
      timer = setInterval(ping, PING_INTERVAL_MS);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, []);

  return null;
}
