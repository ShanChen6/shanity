"use client";

import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { API_URL } from "@/lib/api";

export type SystemState = "operational" | "degraded" | "offline" | "checking";

const POLL_MS = 60_000;

const TIMEOUT_MS = 6000;

// React Query rejects `undefined` data, so a healthy probe resolves to `true`.
async function probe(signal: AbortSignal): Promise<true> {
  // Aborts on the query's own cancellation or after the timeout. Composed by
  // hand: AbortSignal.any is missing from Safari < 17.4 and Firefox < 124,
  // where it would make every probe look like an outage.
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    // Plain fetch: the health route is public, so no session or refresh logic.
    const response = await fetch(`${API_URL}/health/db`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`health ${response.status}`);
    return true;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/**
 * Whether the API and its database answer. Polls once a minute and pauses
 * while the tab is hidden, so an open footer costs almost nothing.
 */
export function useSystemStatus(): {
  state: SystemState;
  checkedAt: number | null;
  refetch: () => void;
} {
  const online = useOnlineStatus();
  const query = useQuery({
    queryKey: ["system-status"],
    queryFn: ({ signal }) => probe(signal),
    enabled: online,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS / 2,
    retry: false,
  });
  const state: SystemState = !online
    ? "offline"
    : query.isError
      ? "degraded"
      : query.isSuccess
        ? "operational"
        : "checking";
  return {
    state,
    checkedAt: query.dataUpdatedAt || null,
    refetch: () => void query.refetch(),
  };
}

export const SYSTEM_STATE_COPY: Record<
  SystemState,
  { label: string; dot: string }
> = {
  operational: { label: "Hệ thống hoạt động bình thường", dot: "bg-online" },
  degraded: { label: "Hệ thống đang gặp sự cố", dot: "bg-danger" },
  offline: { label: "Bạn đang ngoại tuyến", dot: "bg-offline" },
  checking: { label: "Đang kiểm tra hệ thống…", dot: "bg-warning" },
};
