import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSession } from "./types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/student/courses/js/live/s1",
}));
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({ user: { id: "me", displayName: "Tôi" }, status: "authenticated" }),
}));
// The chat has its own suite; here it only has to be beside the player.
vi.mock("@/features/chat/CourseChatRoom", () => ({
  CourseChatRoom: ({ courseId }: { courseId: string }) => <div data-testid="chat">{courseId}</div>,
}));

const { LiveSessionWorkspace } = await import("./LiveSessionWorkspace");

const T0 = Date.parse("2026-10-10T09:45:00.000Z");
const VIDEO = "dQw4w9WgXcQ";
const session = (extra: Partial<LiveSession> = {}): LiveSession => ({
  id: "s1",
  courseId: "c1",
  course: { id: "c1", title: "JavaScript cơ bản", slug: "js" },
  instructor: { id: "t1", name: "Cô Lan", avatarUrl: null },
  title: "Buổi 3: Closure",
  description: "Đọc trước bài Closure.\nCài Node 22.",
  startTime: "2026-10-10T10:00:00.000Z",
  endTime: "2026-10-10T11:00:00.000Z",
  provider: "YOUTUBE",
  status: "SCHEDULED",
  embedUrl: null,
  isReplay: false,
  canManage: false,
  ...extra,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The API, answering as the real one would at the (fake) current time. */
function serveSession(options: { serverLagMs?: number } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = new URL(input).pathname;
      calls.push(path);
      const serverNow = Date.now() - (options.serverLagMs ?? 0);
      if (path.endsWith("/live-sessions"))
        return json({ serverTime: new Date(serverNow).toISOString(), sessions: [session()] });
      const live = serverNow >= Date.parse(session().startTime);
      return json({
        serverTime: new Date(serverNow).toISOString(),
        session: live
          ? session({ status: "LIVE", embedUrl: `https://www.youtube.com/embed/${VIDEO}?autoplay=1` })
          : session(),
      });
    }),
  );
  return calls;
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<LiveSessionWorkspace courseSlug="js" sessionId="s1" />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/** Advances the fake clock in small steps until the player shows up. */
async function untilPlayer(maxMs = 5000) {
  for (let waited = 0; waited <= maxMs; waited += 250) {
    const player = screen.queryByTestId("live-player");
    if (player) return player;
    await tick(250);
  }
  throw new Error("the player never appeared");
}
const sessionCalls = (calls: string[]) => calls.filter((c) => c.endsWith("/live-sessions/s1")).length;

describe("LiveSessionWorkspace", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("AC2: counts down to the second and leaks no stream before the start", async () => {
    serveSession();
    const { container } = renderWorkspace();
    await tick(0);
    expect(screen.getByTestId("live-countdown")).toHaveTextContent("00:15:00");
    await tick(1000);
    expect(screen.getByTestId("live-countdown")).toHaveTextContent("00:14:59");
    expect(screen.queryByTestId("live-player")).toBeNull();
    expect(container.innerHTML).not.toContain(VIDEO);
    expect(screen.getByText(/Đọc trước bài Closure/)).toBeInTheDocument();
    expect(screen.getByTestId("chat")).toHaveTextContent("c1");
  });

  it("AC2: opens the player by itself at 00:00:00, without a reload", async () => {
    const calls = serveSession();
    vi.setSystemTime(Date.parse("2026-10-10T09:59:57.000Z"));
    renderWorkspace();
    await tick(0);
    expect(screen.getByTestId("live-countdown")).toHaveTextContent("00:00:03");
    expect(sessionCalls(calls)).toBe(1);

    await tick(3000);
    const player = await untilPlayer(500);
    expect(player).toHaveAttribute("src", `https://www.youtube.com/embed/${VIDEO}?autoplay=1`);
    expect(screen.getByTestId("live-status")).toHaveTextContent("Đang phát trực tiếp");
    expect(sessionCalls(calls)).toBe(2);
  });

  it("keeps asking briefly when the server's clock is a little behind", async () => {
    const calls = serveSession({ serverLagMs: 2000 });
    vi.setSystemTime(Date.parse("2026-10-10T09:59:59.000Z"));
    renderWorkspace();
    await tick(0);
    // The device clock is adjusted to the server's: still 3 s to go.
    expect(screen.getByTestId("live-countdown")).toHaveTextContent("00:00:03");
    await tick(3000);
    expect(await untilPlayer()).toBeInTheDocument();
    expect(sessionCalls(calls)).toBeLessThanOrEqual(3);
  });

  it("AC1: shows a 403 instead of the class to someone not enrolled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ statusCode: 403, message: "ENROLLMENT_REQUIRED", code: "ENROLLMENT_REQUIRED" }, 403),
      ),
    );
    renderWorkspace();
    await tick(0);
    expect(screen.getByTestId("live-refused")).toHaveTextContent(
      "Bạn không có quyền vào buổi học này",
    );
    expect(screen.queryByTestId("live-player")).toBeNull();
  });

  it("offers the replay once it has ended", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        new URL(input).pathname.endsWith("/live-sessions")
          ? json({ serverTime: new Date().toISOString(), sessions: [] })
          : json({
              serverTime: new Date().toISOString(),
              session: session({
                status: "ENDED",
                isReplay: true,
                embedUrl: `https://www.youtube.com/embed/${VIDEO}?autoplay=1`,
              }),
            }),
      ),
    );
    renderWorkspace();
    await tick(0);
    expect(screen.getByTestId("live-ended")).toHaveTextContent("xem lại bản ghi");
    expect(screen.getByTestId("live-player")).toBeInTheDocument();
  });
});
