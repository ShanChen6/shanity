import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { HeartbeatResult } from "./api";
import { AttendanceIndicator } from "./AttendanceIndicator";
import { HEARTBEAT_INTERVAL_MS, useLiveClassHeartbeat } from "./useLiveClassHeartbeat";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setup(live = true, send = vi.fn(async (): Promise<HeartbeatResult> => beat(30))) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ isLive }) => useLiveClassHeartbeat("s1", isLive, { send }),
    { wrapper, initialProps: { isLive: live } },
  );
  return { ...hook, send };
}
const beat = (seconds: number, isAttended = false): HeartbeatResult => ({
  accepted: true,
  durationSeconds: seconds,
  requiredSeconds: 1800,
  isAttended,
});

describe("useLiveClassHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ durationSeconds: 0, requiredSeconds: 1800, isAttended: false }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pings every 30 s of visible time, and not on page open", async () => {
    const { send, result } = setup();
    await tick(HEARTBEAT_INTERVAL_MS - 1);
    expect(send).not.toHaveBeenCalled();
    await tick(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("s1");
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.attendance).toMatchObject({ durationSeconds: 30 });
  });

  it("AC1: stops while the tab is hidden and restarts a full 30 s on return", async () => {
    const { send, result } = setup();
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    expect(result.current.paused).toBe(true);
    await tick(10 * HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await tick(HEARTBEAT_INTERVAL_MS - 1);
    expect(send).toHaveBeenCalledTimes(1); // a fresh 30 s, not the old timer
    await tick(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does nothing outside the live window, and stops when it ends or unmounts", async () => {
    const { send, rerender, unmount } = setup(false);
    await tick(5 * HEARTBEAT_INTERVAL_MS);
    expect(send).not.toHaveBeenCalled();

    rerender({ isLive: true });
    await tick(HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    rerender({ isLive: false }); // status ENDED
    await tick(5 * HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    rerender({ isLive: true });
    unmount();
    await tick(5 * HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives up for good when the server refuses, but retries after a 429", async () => {
    const send = vi
      .fn<() => Promise<HeartbeatResult>>()
      .mockRejectedValueOnce(new ApiError(429, ["slow down"]))
      .mockRejectedValueOnce(new ApiError(403, ["no"]))
      .mockResolvedValue(beat(30));
    setup(true, send);
    await tick(HEARTBEAT_INTERVAL_MS);
    await tick(HEARTBEAT_INTERVAL_MS);
    await tick(5 * HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("AttendanceIndicator", () => {
  it("is amber with the target until reached, then green and checked", () => {
    const { rerender } = render(
      <AttendanceIndicator attendance={beat(12 * 60)} paused={false} />,
    );
    const pill = screen.getByTestId("attendance-indicator");
    expect(pill).toHaveTextContent("Đã tham gia: 12 phút / Target: 30 phút");
    expect(pill).toHaveTextContent("Chưa đủ thời lượng");
    expect(pill).toHaveClass("bg-warning-background");
    rerender(<AttendanceIndicator attendance={beat(12 * 60)} paused />);
    expect(pill).toHaveTextContent("Tạm dừng");
    rerender(<AttendanceIndicator attendance={beat(30 * 60, true)} paused={false} />);
    expect(pill).toHaveTextContent("Đã điểm danh");
    expect(pill).toHaveClass("bg-success-background");
  });
});
