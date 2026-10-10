"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  fetchMyAttendance,
  sendHeartbeat,
  type AttendanceState,
  type HeartbeatResult,
} from "./api";

/** One ping per this much *visible* time. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isVisible = () => document.visibilityState === "visible";

/**
 * Proves presence in a live class: while the class is on AND this tab is
 * visible, a heartbeat goes out every 30 s. Hiding the tab (another tab,
 * minimized window) pauses it, and coming back starts a fresh 30 s, so
 * opening the page alone, or leaving it in the background, earns nothing.
 * The server decides what each ping is worth; this hook only reports it.
 */
export function useLiveClassHeartbeat(
  sessionId: string,
  isSessionLive: boolean,
  {
    intervalMs = HEARTBEAT_INTERVAL_MS,
    send = sendHeartbeat,
  }: { intervalMs?: number; send?: (id: string) => Promise<HeartbeatResult> } = {},
) {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => false);
  const initial = useQuery({
    queryKey: ["live", "attendance", sessionId],
    queryFn: ({ signal }) => fetchMyAttendance(sessionId, signal),
    retry: false,
  });
  const [latest, setLatest] = useState<AttendanceState | null>(null);
  // The server refused us for good (not a learner here, class over).
  const [stopped, setStopped] = useState(false);
  const active = isSessionLive && visible && !stopped;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      send(sessionId).then(
        (result) => setLatest(result),
        (error: unknown) => {
          if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status))
            setStopped(true);
          // 429 and network errors: the next interval simply tries again.
        },
      );
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, sessionId, intervalMs, send]);

  return {
    attendance: latest ?? initial.data ?? null,
    /** Sending pings right now. */
    active,
    /** Live, but the tab is in the background: nothing is being counted. */
    paused: isSessionLive && !visible && !stopped,
  };
}
