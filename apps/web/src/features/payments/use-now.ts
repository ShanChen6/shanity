"use client";

import { useEffect, useState } from "react";

/**
 * Current time as state, refreshed every `intervalMs` (null = frozen). Keeps
 * render pure: components never call Date.now() themselves.
 */
export function useNow(intervalMs: number | null = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    // Catch up immediately (the value may be stale when the interval resumes).
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
