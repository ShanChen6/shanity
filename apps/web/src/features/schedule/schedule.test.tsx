import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleSession } from "./api";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { STATUS_STYLE, canEnter, toCalendarEvents } from "./schedule-model";

const session = (extra: Partial<ScheduleSession> = {}): ScheduleSession => ({
  id: "s1",
  title: "Closure",
  courseId: "c1",
  courseName: "JavaScript cơ bản",
  courseSlug: "js",
  instructorName: "Cô Lan",
  startTime: "2026-10-12T02:00:00.000Z",
  endTime: "2026-10-12T03:00:00.000Z",
  status: "SCHEDULED",
  provider: "YOUTUBE",
  role: "student",
  liveClassUrl: "/student/courses/js/live/s1",
  ...extra,
});

describe("schedule model", () => {
  it("colours by status: blue scheduled, blinking red live, grey ended", () => {
    const [scheduled, live, ended] = toCalendarEvents([
      session(),
      session({ id: "s2", status: "LIVE" }),
      session({ id: "s3", status: "ENDED" }),
    ]);
    expect(scheduled).toMatchObject({
      id: "s1",
      title: "Closure · JavaScript cơ bản",
      start: "2026-10-12T02:00:00.000Z",
      backgroundColor: "var(--color-info)",
    });
    expect(live).toMatchObject({ backgroundColor: "var(--color-danger)" });
    expect(live!.classNames).toContain("animate-pulse");
    expect(ended).toMatchObject({ backgroundColor: "var(--color-muted)" });
    expect(STATUS_STYLE.CANCELLED.classNames).toContain("line-through");
    expect(canEnter("CANCELLED")).toBe(false);
    expect(canEnter("ENDED")).toBe(true);
  });
});

describe("ScheduleCalendar", () => {
  let requests: URL[];
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T08:00:00.000Z"));
    requests = [];
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        requests.push(new URL(input));
        return new Response(
          JSON.stringify({
            serverTime: new Date().toISOString(),
            sessions: [session(), session({ id: "s9", title: "Đã hủy", status: "CANCELLED" })],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the visible range and opens a session with a way in", async () => {
    render(<ScheduleCalendar />);
    await act(async () => {});
    await waitFor(() => expect(requests).toHaveLength(1));
    const asked = requests[0]!;
    expect(asked.pathname).toBe("/api/v1/live-sessions/my-schedule");
    const start = Date.parse(asked.searchParams.get("startDate")!);
    const end = Date.parse(asked.searchParams.get("endDate")!);
    // The month view of October 2026 covers the 12th.
    expect(start).toBeLessThan(Date.parse("2026-10-12T02:00:00Z"));
    expect(end).toBeGreaterThan(Date.parse("2026-10-12T03:00:00Z"));

    const event = await screen.findByText(/Closure · JavaScript cơ bản/);
    await userEvent.click(event);
    const dialog = screen.getByRole("dialog", { name: "Closure" });
    expect(within(dialog).getByText("Sắp diễn ra")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Vào phòng học ngay" })).toHaveAttribute(
      "href",
      "/student/courses/js/live/s1",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));

    await userEvent.click(await screen.findByText(/Đã hủy · JavaScript/));
    const cancelled = screen.getByRole("dialog", { name: "Đã hủy" });
    expect(within(cancelled).queryByRole("link")).toBeNull();
  });
});
