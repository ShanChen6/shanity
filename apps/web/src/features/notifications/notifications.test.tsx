import { pageEnvelope } from "@/test-utils/envelope";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api";

let roles: Role[] = ["student"];
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({ user: { id: "u1", roles } }),
}));

import { NotificationBell } from "./notification-bell";

const API = "http://localhost:4000";
let routes: Record<string, (() => unknown) | undefined>;
let calls: string[];

function renderBell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}
// GET /api/v1/student/quiz-attempts answers with the standard envelope.
const attemptsPage = (attempts: unknown[]) => ({
  success: true,
  statusCode: 200,
  message: "OK",
  data: attempts,
  meta: { page: 1, limit: 20, total: attempts.length, totalPages: 1 },
});
const attempt = (over: Record<string, unknown> = {}) => ({
  attemptId: "a1",
  quizTitle: "Quiz JS",
  status: "IN_PROGRESS",
  isExpired: false,
  ...over,
});

beforeEach(() => {
  roles = ["student"];
  calls = [];
  routes = {
    "/api/v1/student/orders": () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    }),
    "/api/v1/student/quiz-attempts": () => attemptsPage([]),
    "/api/v1/instructor/grading-queue": () => pageEnvelope([]),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.replace(API, "").split("?")[0]!;
      calls.push(path);
      const handler = routes[path];
      return new Response(JSON.stringify(handler ? handler() : {}), {
        status: handler ? 200 : 404,
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => userEvent.click(screen.getByLabelText(/^Thông báo/));

describe("NotificationBell", () => {
  it("is calm when nothing is waiting", async () => {
    renderBell();
    await waitFor(() => expect(calls).toHaveLength(2));
    await open();
    expect(
      await screen.findByText("Bạn đã xử lý hết mọi việc."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Thông báo")).toBeInTheDocument();
  });

  it("lists unpaid orders and unfinished quizzes for a learner", async () => {
    routes["/api/v1/student/orders"] = () => ({
      data: [{}, {}],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    routes["/api/v1/student/quiz-attempts"] = () =>
      attemptsPage([
        attempt(),
        attempt({ attemptId: "a2", status: "NEEDS_GRADING" }),
      ]);
    renderBell();
    const bell = await screen.findByLabelText("Thông báo, 2 mục cần xử lý");
    await userEvent.click(bell);
    expect(
      screen.getByRole("link", { name: /2 đơn hàng chờ thanh toán/ }),
    ).toHaveAttribute("href", "/account/orders?status=pending");
    expect(
      screen.getByRole("link", { name: /Bạn đang làm dở “Quiz JS”/ }),
    ).toHaveAttribute("href", "/quiz-attempts");
  });

  it("ignores expired attempts and attempts that are not in progress", async () => {
    routes["/api/v1/student/quiz-attempts"] = () =>
      attemptsPage([
        attempt({ isExpired: true }),
        attempt({ attemptId: "a3", status: "COMPLETED" }),
      ]);
    renderBell();
    await waitFor(() => expect(calls).toHaveLength(2));
    await open();
    expect(
      await screen.findByText("Bạn đã xử lý hết mọi việc."),
    ).toBeInTheDocument();
  });

  it("pluralises several unfinished quizzes into one entry", async () => {
    routes["/api/v1/student/quiz-attempts"] = () =>
      attemptsPage([
        attempt(),
        attempt({ attemptId: "a2", quizTitle: "Quiz 2" }),
      ]);
    renderBell();
    await userEvent.click(
      await screen.findByLabelText("Thông báo, 1 mục cần xử lý"),
    );
    expect(
      screen.getByRole("link", { name: /2 bài kiểm tra đang làm dở/ }),
    ).toBeInTheDocument();
  });

  it("tells instructors how many answers wait for grading, and only them", async () => {
    roles = ["instructor"];
    routes["/api/v1/instructor/grading-queue"] = () =>
      pageEnvelope([], { total: 3, totalPages: 1 });
    renderBell();
    await userEvent.click(
      await screen.findByLabelText("Thông báo, 1 mục cần xử lý"),
    );
    expect(
      screen.getByRole("link", { name: /3 bài làm cần chấm/ }),
    ).toHaveAttribute("href", "/instructor/grading");
    // An instructor-only account is not asked about learner data.
    expect(calls).toEqual(["/api/v1/instructor/grading-queue"]);
  });

  it("never asks a learner about the grading queue", async () => {
    renderBell();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).not.toContain("/api/v1/instructor/grading-queue");
  });

  it("closes on Escape and returns focus to the bell", async () => {
    renderBell();
    await waitFor(() => expect(calls).toHaveLength(2));
    await open();
    const details = screen.getByLabelText(/^Thông báo/).closest("details")!;
    expect(details).toHaveAttribute("open");
    await userEvent.keyboard("{Escape}");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByLabelText(/^Thông báo/)).toHaveFocus();
  });
});
