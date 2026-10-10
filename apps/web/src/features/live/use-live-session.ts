"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { fetchLiveSession, liveKeys } from "./api";
import { clockOffset, phaseAt } from "./live-time";
import type { LiveStatus } from "./types";

/** Server a little behind us at the start: ask again this soon. */
export const UNVEIL_RETRY_MS = 1500;

/**
 * One live session, ticking every second on the server's clock. At the
 * start (and the end) it asks the server again, and keeps asking briefly
 * until the server agrees, so the player appears without a reload. The
 * embed URL only ever comes from the server; the clock alone unveils
 * nothing.
 */
export function useLiveSession(id: string) {
  const query = useQuery({
    queryKey: liveKeys.session(id),
    // When it arrived, to read the server's clock from the device's.
    queryFn: async ({ signal }) => ({
      ...(await fetchLiveSession(id, signal)),
      receivedAt: Date.now(),
    }),
    retry: (count, error) =>
      !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 2,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const offset = query.data
    ? clockOffset(query.data.serverTime, query.data.receivedAt)
    : 0;
  const serverNow = now + offset;

  const session = query.data?.session;
  const phase: LiveStatus | null = session ? phaseAt(session, serverNow) : null;
  // The page believes the phase changed but the data has not caught up.
  const behind =
    !!session &&
    phase !== session.status &&
    !(phase === "LIVE" && session.status === "LIVE");

  const { refetch, isFetching, dataUpdatedAt } = query;
  useEffect(() => {
    if (!session || isFetching) return;
    if (behind) {
      // At once the first time; then no faster than UNVEIL_RETRY_MS.
      const wait = Math.max(0, dataUpdatedAt + UNVEIL_RETRY_MS - Date.now());
      const timer = window.setTimeout(() => void refetch(), wait);
      return () => window.clearTimeout(timer);
    }
    // Otherwise wake up exactly at the next boundary.
    const next =
      phase === "SCHEDULED"
        ? Date.parse(session.startTime)
        : phase === "LIVE"
          ? Date.parse(session.endTime)
          : null;
    if (next === null) return;
    const timer = window.setTimeout(
      () => void refetch(),
      Math.max(0, next - serverNow),
    );
    return () => window.clearTimeout(timer);
  }, [session, phase, behind, isFetching, refetch, serverNow, dataUpdatedAt]);

  return {
    session,
    /** What to show: the clock's phase once the server confirmed it. */
    phase: behind && session ? session.status : phase,
    serverNow,
    error: query.error,
    isPending: query.isPending,
    /** Past the start, waiting for the server to hand over the player. */
    unveiling: behind && phase === "LIVE",
  };
}
