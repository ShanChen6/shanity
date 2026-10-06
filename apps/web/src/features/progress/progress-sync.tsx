"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { refreshCourseProgress } from "./use-course-progress";

const CHANNEL = "shanity-progress";
type ProgressMessage = { type: "progress-changed"; courseId: string };

// Tell other tabs of this browser that a course's progress changed. Other
// devices pick changes up on focus/reconnect (React Query refetchOnWindowFocus)
// because progress responses are never cached (Cache-Control: no-store).
export function broadcastProgressChanged(courseId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({
    type: "progress-changed",
    courseId,
  } satisfies ProgressMessage);
  channel.close();
}

/** Mounted once per tab: refreshes progress when another tab changes it. */
export function ProgressSync() {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<ProgressMessage>) => {
      if (
        event.data?.type === "progress-changed" &&
        typeof event.data.courseId === "string"
      )
        refreshCourseProgress(client, event.data.courseId);
    };
    return () => channel.close();
  }, [client]);
  return null;
}
