"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { fetchOrderStatus } from "./api";
import { effectiveStatus, TERMINAL_STATUSES } from "./order-model";
import type { OrderStatus, OrderStatusSnapshot } from "./types";

export const POLL_INTERVAL_MS = 3000;
// After the deadline a late bank notification can still complete the order,
// so keep listening for a while, more slowly.
export const EXPIRED_POLL_INTERVAL_MS = 10_000;
export const EXPIRED_LISTEN_WINDOW_MS = 30 * 60_000;
const MAX_BACKOFF_MS = 30_000;

type Options = {
  enabled?: boolean;
  intervalMs?: number;
  expiredIntervalMs?: number;
  expiredWindowMs?: number;
  fetcher?: typeof fetchOrderStatus;
};

export type OrderStatusState = {
  snapshot: OrderStatusSnapshot | null;
  /** Clock-corrected: a PENDING order past its deadline reads EXPIRED. */
  status: OrderStatus | null;
  isPaid: boolean;
  /** Last poll failed; the previous snapshot is still shown. */
  error: string | null;
  /** Polling stopped for good (order not found / not yours / signed out). */
  fatal: boolean;
  /** serverNow = clientNow + clockOffsetMs */
  clockOffsetMs: number;
  /** Client clock (ms) as of the last update; render-pure `Date.now()`. */
  nowMs: number;
  refetch: () => void;
};

/** Delay before the next poll, or null when nothing more can happen. */
export function nextPollDelay(
  snapshot: OrderStatusSnapshot,
  serverNow: number,
  options: Required<
    Pick<Options, "intervalMs" | "expiredIntervalMs" | "expiredWindowMs">
  >,
): number | null {
  if (TERMINAL_STATUSES.includes(snapshot.status)) return null;
  if (snapshot.status === "EXPIRED")
    return serverNow <
      new Date(snapshot.expiresAt).getTime() + options.expiredWindowMs
      ? options.expiredIntervalMs
      : null;
  return options.intervalMs;
}

type State = {
  /** The order this state belongs to; a different code means "nothing yet". */
  code: string | null;
  snapshot: OrderStatusSnapshot | null;
  error: string | null;
  fatal: boolean;
  offset: number;
  now: number;
};

const blank = (code: string | null, now: number): State => ({
  code,
  snapshot: null,
  error: null,
  fatal: false,
  offset: 0,
  now,
});

/**
 * Polls GET /api/v1/orders/:code/status until the order settles, so the page
 * flips to "paid" the moment the backend receives the bank/gateway webhook,
 * with no manual refresh.
 *
 * - One request at a time (next poll is scheduled after the previous finishes).
 * - Pauses while the tab is hidden and re-checks immediately when it returns.
 * - Network errors back off exponentially (capped), keeping the last snapshot.
 * - 401/403/404 stop polling (`fatal`).
 * - Unmount or code change aborts the in-flight request and clears every timer.
 */
export function useOrderStatus(
  orderCode: string | null,
  {
    enabled = true,
    intervalMs = POLL_INTERVAL_MS,
    expiredIntervalMs = EXPIRED_POLL_INTERVAL_MS,
    expiredWindowMs = EXPIRED_LISTEN_WINDOW_MS,
    fetcher = fetchOrderStatus,
  }: Options = {},
): OrderStatusState {
  const [state, setState] = useState<State>(() => blank(orderCode, Date.now()));
  const pollNow = useRef<() => void>(() => undefined);
  // State from a previous order code must never leak into the new one.
  const current =
    state.code === orderCode ? state : blank(orderCode, state.now);

  useEffect(() => {
    if (!orderCode || !enabled) {
      pollNow.current = () => undefined;
      return;
    }

    let stopped = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const patch = (change: Partial<State>) =>
      setState((previous) => ({
        ...(previous.code === orderCode
          ? previous
          : blank(orderCode, Date.now())),
        ...change,
      }));

    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    };

    async function poll() {
      if (stopped || inFlight) return;
      // Hidden tabs do not poll; `visibilitychange` resumes immediately.
      if (document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      try {
        const next = await fetcher(orderCode!, controller.signal);
        if (stopped) return;
        failures = 0;
        const now = Date.now();
        const offset = new Date(next.serverTime).getTime() - now;
        patch({ snapshot: next, error: null, offset, now });
        const delay = nextPollDelay(next, now + offset, {
          intervalMs,
          expiredIntervalMs,
          expiredWindowMs,
        });
        if (delay !== null) schedule(delay);
      } catch (reason) {
        if (stopped || controller.signal.aborted) return;
        if (
          reason instanceof ApiError &&
          [401, 403, 404].includes(reason.status)
        ) {
          patch({ fatal: true, error: reason.message });
          return;
        }
        failures += 1;
        patch({
          error:
            reason instanceof ApiError
              ? reason.message
              : "Không thể cập nhật trạng thái đơn hàng.",
        });
        schedule(Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS));
      } finally {
        inFlight = false;
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    pollNow.current = () => {
      clearTimeout(timer);
      void poll();
    };
    void poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      pollNow.current = () => undefined;
    };
  }, [
    orderCode,
    enabled,
    intervalMs,
    expiredIntervalMs,
    expiredWindowMs,
    fetcher,
  ]);

  // Re-render exactly when the deadline passes so PENDING reads EXPIRED even
  // between polls.
  const { snapshot, offset } = current;
  const pendingDeadline =
    snapshot?.status === "PENDING"
      ? new Date(snapshot.expiresAt).getTime()
      : null;
  useEffect(() => {
    if (pendingDeadline === null || !orderCode) return;
    const delay = pendingDeadline - (Date.now() + offset);
    if (delay <= 0) return;
    const timer = setTimeout(
      () =>
        setState((previous) =>
          previous.code === orderCode
            ? { ...previous, now: Date.now() }
            : previous,
        ),
      delay + 50,
    );
    return () => clearTimeout(timer);
  }, [pendingDeadline, offset, orderCode]);

  const refetch = useCallback(() => pollNow.current(), []);
  const status = snapshot
    ? effectiveStatus(snapshot.status, snapshot.expiresAt, current.now + offset)
    : null;
  return {
    snapshot,
    status,
    isPaid: snapshot?.isPaid ?? false,
    error: current.error,
    fatal: current.fatal,
    clockOffsetMs: offset,
    nowMs: current.now,
    refetch,
  };
}
