import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { OrderStatus, OrderStatusSnapshot } from "./types";
import { useOrderStatus } from "./use-order-status";

const T0 = new Date("2026-10-07T10:00:00.000Z").getTime();
const snap = (
  status: OrderStatus,
  expiresInMs = 15 * 60_000,
  skewMs = 0,
): OrderStatusSnapshot => ({
  status,
  isPaid: status === "COMPLETED",
  expiresAt: new Date(T0 + skewMs + expiresInMs).toISOString(),
  serverTime: new Date(Date.now() + skewMs).toISOString(),
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useOrderStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately and every 3 seconds while the order is pending", async () => {
    const fetcher = vi.fn(async () => snap("PENDING"));
    const { result } = renderHook(() => useOrderStatus("SHAN-1", { fetcher }));
    await tick(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("PENDING");
    await tick(3000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await tick(6000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenLastCalledWith("SHAN-1", expect.any(AbortSignal));
  });

  it("flips to paid when the webhook lands and then stops polling", async () => {
    const responses = [snap("PENDING"), snap("PENDING"), snap("COMPLETED")];
    const fetcher = vi.fn(async () => responses.shift() ?? snap("COMPLETED"));
    const { result } = renderHook(() => useOrderStatus("SHAN-1", { fetcher }));
    await tick(0);
    expect(result.current.isPaid).toBe(false);
    await tick(6000);
    expect(result.current.isPaid).toBe(true);
    expect(result.current.status).toBe("COMPLETED");
    const calls = fetcher.mock.calls.length;
    await tick(60_000);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it("never overlaps requests and cleans up on unmount", async () => {
    let release: (value: OrderStatusSnapshot) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(
      (_code: string, s?: AbortSignal) =>
        new Promise<OrderStatusSnapshot>((resolve) => {
          signal = s;
          release = resolve;
        }),
    );
    const { unmount } = renderHook(() => useOrderStatus("SHAN-1", { fetcher }));
    await tick(10_000); // a slow response must not trigger more requests
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
    expect(signal?.aborted).toBe(true);
    release(snap("PENDING"));
    await tick(30_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not poll in a hidden tab and catches up when it returns", async () => {
    const fetcher = vi.fn(async () => snap("PENDING"));
    setVisibility("hidden");
    renderHook(() => useOrderStatus("SHAN-1", { fetcher }));
    await tick(20_000);
    expect(fetcher).not.toHaveBeenCalled();
    setVisibility("visible");
    await tick(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await tick(3000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("backs off after network errors, keeps the last snapshot, then recovers", async () => {
    const fetcher = vi
      .fn<() => Promise<OrderStatusSnapshot>>()
      .mockResolvedValueOnce(snap("PENDING"))
      .mockRejectedValueOnce(new ApiError(0, ["offline"]))
      .mockRejectedValueOnce(new ApiError(0, ["offline"]))
      .mockResolvedValue(snap("PENDING"));
    const { result } = renderHook(() => useOrderStatus("SHAN-1", { fetcher }));
    await tick(0);
    await tick(3000); // 2nd call fails
    expect(result.current.error).toBe("offline");
    expect(result.current.snapshot?.status).toBe("PENDING");
    await tick(5999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await tick(1); // 3000 * 2^1 = 6s
    expect(fetcher).toHaveBeenCalledTimes(3);
    await tick(12_000); // 3000 * 2^2
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.current.error).toBeNull();
  });

  it.each([401, 403, 404])("stops for good on HTTP %i", async (status) => {
    const fetcher = vi.fn(async () => {
      throw new ApiError(status, ["nope"]);
    });
    const { result } = renderHook(() => useOrderStatus("SHAN-1", { fetcher }));
    await tick(0);
    expect(result.current.fatal).toBe(true);
    await tick(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps listening slowly after expiry (late bank notification), then gives up", async () => {
    const fetcher = vi.fn(async () => ({
      ...snap("EXPIRED", -60_000),
      serverTime: new Date(Date.now()).toISOString(),
    }));
    renderHook(() =>
      useOrderStatus("SHAN-1", { fetcher, expiredWindowMs: 90_000 }),
    );
    await tick(0);
    await tick(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await tick(60_000); // the window (30s from now) is over
    const calls = fetcher.mock.calls.length;
    await tick(120_000);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it("reads EXPIRED the moment the deadline passes, without another poll", async () => {
    const fetcher = vi.fn(async () => snap("PENDING", 5000));
    const { result } = renderHook(() =>
      useOrderStatus("SHAN-1", { fetcher, intervalMs: 60_000 }),
    );
    await tick(0);
    expect(result.current.status).toBe("PENDING");
    await tick(5200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("EXPIRED");
  });

  it("uses the server clock, so a skewed device clock cannot expire an order early", async () => {
    // Client clock runs 10 minutes fast relative to the server.
    const fetcher = vi.fn(async () =>
      snap("PENDING", 15 * 60_000, -10 * 60_000),
    );
    const { result } = renderHook(() =>
      useOrderStatus("SHAN-1", { fetcher, intervalMs: 600_000 }),
    );
    await tick(0);
    expect(result.current.clockOffsetMs).toBeCloseTo(-10 * 60_000, -2);
    expect(result.current.status).toBe("PENDING");
  });

  it("does nothing when disabled and resets when the order changes", async () => {
    const fetcher = vi.fn(async (code: string) =>
      code === "A" ? snap("COMPLETED") : snap("PENDING"),
    );
    const { result, rerender } = renderHook(
      ({ code, enabled }) => useOrderStatus(code, { fetcher, enabled }),
      { initialProps: { code: "A", enabled: false } },
    );
    await tick(10_000);
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ code: "A", enabled: true });
    await tick(0);
    expect(result.current.isPaid).toBe(true);
    rerender({ code: "B", enabled: true });
    expect(result.current.snapshot).toBeNull(); // no leakage from order A
    await tick(0);
    expect(result.current.isPaid).toBe(false);
  });

  it("refetch() polls right away", async () => {
    const fetcher = vi.fn(async () => snap("PENDING"));
    const { result } = renderHook(() =>
      useOrderStatus("SHAN-1", { fetcher, intervalMs: 600_000 }),
    );
    await tick(0);
    act(() => result.current.refetch());
    await tick(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
