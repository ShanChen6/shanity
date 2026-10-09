import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptRunner } from "@/features/quiz-player/AttemptRunner";
import type { Attempt } from "@/features/quiz-player/api";
import type { MyAttempt, StandaloneDetail } from "./api";
import { MyQuizAttempts, attemptAction, attemptBadge } from "./MyQuizAttempts";
import { QuizLanding, primaryAction } from "./QuizLanding";

const API = "http://localhost:4000";
const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
  usePathname: () => "/quiz-attempts",
  useSearchParams: () => search,
}));

type Call = { method: string; path: string; body: unknown };
let calls: Call[];
let routes: Record<string, (body: unknown) => [unknown, number?]>;

beforeEach(() => {
  calls = [];
  routes = {};
  push.mockReset();
  replace.mockReset();
  search = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API, "");
      const method = init.method ?? "GET";
      const body =
        typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });
      const handler =
        routes[`${method} ${path}`] ??
        routes[`${method} ${path.split("?")[0]}`];
      const [data, status = 200] = handler
        ? handler(body)
        : [{ message: "nope" }, 404];
      return new Response(JSON.stringify(data), { status });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const detail = (extra: Partial<StandaloneDetail> = {}): StandaloneDetail => ({
  id: "z1",
  slug: "js-assessment",
  title: "JS Assessment",
  description: "Đánh giá JavaScript",
  passingScore: 70,
  durationMinutes: 20,
  maxAttempts: 3,
  totalQuestions: 2,
  totalPoints: 40,
  difficulty: "BEGINNER",
  tags: ["javascript"],
  totalAttempts: 5,
  publishedAt: null,
  reviewPolicy: "AFTER_PASS",
  attemptsUsed: 0,
  attemptsRemaining: 3,
  hasActiveAttempt: false,
  isPassed: false,
  highestPercentage: null,
  latestResult: null,
  ...extra,
});

describe("landing primary action", () => {
  it("starts, resumes, or blocks once attempts run out", () => {
    expect(primaryAction(detail())).toBe("start");
    expect(primaryAction(detail({ hasActiveAttempt: true }))).toBe("resume");
    expect(
      primaryAction(detail({ attemptsRemaining: 0, attemptsUsed: 3 })),
    ).toBe("exhausted");
    expect(
      primaryAction(detail({ maxAttempts: null, attemptsRemaining: null })),
    ).toBe("start");
  });

  it("shows the specs and the learner's standing, then starts and opens the runner", async () => {
    routes["GET /api/v1/student/quizzes/standalone/js-assessment"] = () => [
      detail({
        attemptsUsed: 1,
        attemptsRemaining: 2,
        highestPercentage: 75,
        latestResult: {
          attemptId: "a1",
          status: "SUBMITTED",
          passed: true,
          percentage: 75,
          submittedAt: null,
        },
      }),
    ];
    routes["POST /api/v1/student/quizzes/z1/attempts"] = () => [
      { id: "a2", status: "IN_PROGRESS" },
      201,
    ];
    render(<QuizLanding slug="js-assessment" />, { wrapper: wrapper() });
    expect(
      await screen.findByRole("heading", { name: "JS Assessment" }),
    ).toBeInTheDocument();
    expect(screen.getByText("20 phút")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("3 lượt")).toBeInTheDocument();
    expect(screen.getByText("Xem đáp án khi đạt")).toBeInTheDocument();
    expect(screen.getByTestId("attempts-used")).toHaveTextContent("1/3");
    expect(screen.getByTestId("highest-score")).toHaveTextContent("75%");
    expect(screen.getByRole("link", { name: /Đạt/ })).toHaveAttribute(
      "href",
      "/quizzes/js-assessment/results/a1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Làm lại" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/quizzes/js-assessment/attempt"),
    );
  });

  it("disables starting when attempts are used up", async () => {
    routes["GET /api/v1/student/quizzes/standalone/js-assessment"] = () => [
      detail({ attemptsUsed: 3, attemptsRemaining: 0 }),
    ];
    render(<QuizLanding slug="js-assessment" />, { wrapper: wrapper() });
    expect(
      await screen.findByRole("button", { name: /Bắt đầu Làm bài/ }),
    ).toBeDisabled();
    expect(screen.getByText("Đã hết số lượt làm bài.")).toBeInTheDocument();
  });
});

const attempt = (extra: Partial<Attempt> = {}): Attempt => ({
  id: "a1",
  quizId: "z1",
  attemptNumber: 1,
  status: "IN_PROGRESS",
  startedAt: "2026-10-07T03:00:00.000Z",
  expiresAt: null,
  submittedAt: null,
  score: null,
  isPassed: null,
  percentage: null,
  serverNow: new Date().toISOString(),
  quiz: {
    title: "JS Assessment",
    description: null,
    durationMinutes: null,
    passingScore: 70,
    questions: [
      {
        id: "q1",
        type: "SINGLE_CHOICE",
        content: "Câu một?",
        position: 1,
        points: 10,
        options: [
          { id: "o1", content: "A", position: 1 },
          { id: "o2", content: "B", position: 2 },
        ],
      },
      {
        id: "q2",
        type: "MULTIPLE_CHOICE",
        content: "Câu hai?",
        position: 2,
        points: 30,
        options: [
          { id: "o3", content: "C", position: 1 },
          { id: "o4", content: "D", position: 2 },
        ],
      },
    ],
  },
  answers: [],
  ...extra,
});

describe("attempt runner", () => {
  it("autosaves, marks the navigator and shows the server save time", async () => {
    routes["PUT /api/v1/student/quiz-attempts/a1/answers"] = (body) => [
      {
        ...(body as object),
        selectedOptionId: "o1",
        savedAt: "2026-10-07T03:04:05.000Z",
      },
    ];
    const user = userEvent.setup();
    render(
      <AttemptRunner
        title="JS Assessment"
        attempt={attempt()}
        onClosed={vi.fn()}
      />,
      {
        wrapper: wrapper(),
      },
    );
    const grid = screen.getByRole("navigation", { name: "Danh sách câu hỏi" });
    const first = within(grid).getByRole("button", { name: /Câu 1/ });
    expect(first).toHaveAttribute("aria-current", "step");
    expect(first).toHaveAttribute("data-state", "empty");

    await user.click(screen.getByRole("radio", { name: "A" }));
    await waitFor(() =>
      expect(screen.getByTestId("autosave-status")).toHaveTextContent(
        /Đã lưu đáp án lúc \d{2}:\d{2}:\d{2}/,
      ),
    );
    expect(calls.find(({ method }) => method === "PUT")!.body).toEqual({
      questionId: "q1",
      selectedOptionIds: ["o1"],
    });
    expect(
      within(grid).getByRole("button", { name: /Câu 1, đã trả lời/ }),
    ).toHaveAttribute("data-state", "answered");

    // Jump with the grid: multiple choice uses checkboxes.
    await user.click(within(grid).getByRole("button", { name: /Câu 2/ }));
    expect(
      screen.getByRole("heading", { name: "Câu hai?" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("restores saved answers and submits to the result", async () => {
    routes["POST /api/v1/student/quiz-attempts/a1/submit"] = () => [
      { id: "a1", status: "SUBMITTED" },
    ];
    const onClosed = vi.fn();
    const user = userEvent.setup();
    render(
      <AttemptRunner
        title="JS Assessment"
        attempt={attempt({
          answers: [
            {
              questionId: "q1",
              selectedOptionId: "o2",
              selectedOptionIds: ["o2"],
              savedAt: "2026-10-07T03:01:00.000Z",
            },
            {
              questionId: "q2",
              selectedOptionId: null,
              selectedOptionIds: ["o3", "o4"],
              savedAt: "2026-10-07T03:02:00.000Z",
            },
          ],
        })}
        onClosed={onClosed}
      />,
      { wrapper: wrapper() },
    );
    expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
    expect(screen.getByText("Đã trả lời 2/2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nộp bài" }));
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith("a1"));
  });

  it("auto-submits on the server deadline and explains it in a modal", async () => {
    routes["POST /api/v1/student/quiz-attempts/a1/submit"] = () => [
      { id: "a1", status: "TIMED_OUT" },
    ];
    const onClosed = vi.fn();
    render(
      <AttemptRunner
        title="JS Assessment"
        // The server says the deadline passed a second ago.
        attempt={attempt({
          expiresAt: new Date(Date.now() - 1000).toISOString(),
          serverNow: new Date().toISOString(),
        })}
        onClosed={onClosed}
      />,
      { wrapper: wrapper() },
    );
    expect(
      await screen.findByRole("heading", { name: "Hết giờ làm bài" }),
    ).toBeInTheDocument();
    expect(
      calls.some(
        ({ method, path }) => method === "POST" && path.endsWith("/submit"),
      ),
    ).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xem kết quả" }));
    expect(onClosed).toHaveBeenCalledWith("a1");
  });

  it("opens the timeout modal when an autosave reports ATTEMPT_EXPIRED", async () => {
    routes["PUT /api/v1/student/quiz-attempts/a1/answers"] = () => [
      {
        code: "ATTEMPT_EXPIRED",
        message: "ATTEMPT_EXPIRED",
        notice: "ATTEMPT_TIMED_OUT",
        attempt: { id: "a1", status: "TIMED_OUT" },
      },
      400,
    ];
    render(
      <AttemptRunner
        title="JS Assessment"
        attempt={attempt()}
        onClosed={vi.fn()}
      />,
      {
        wrapper: wrapper(),
      },
    );
    await userEvent.click(screen.getByRole("radio", { name: "A" }));
    expect(
      await screen.findByRole("heading", { name: "Hết giờ làm bài" }),
    ).toBeInTheDocument();
  });
});

const row = (extra: Partial<MyAttempt>): MyAttempt => ({
  attemptId: "a1",
  quizId: "z1",
  quizTitle: "JS Assessment",
  quizSlug: "js-assessment",
  scope: "STANDALONE",
  courseId: null,
  courseSlug: null,
  courseTitle: null,
  attemptNumber: 1,
  status: "SUBMITTED",
  isExpired: false,
  startedAt: "2026-10-07T03:00:00.000Z",
  submittedAt: "2026-10-07T03:05:30.000Z",
  expiresAt: null,
  durationSeconds: 330,
  earnedPoints: 30,
  totalPoints: 40,
  percentage: 75,
  isPassed: true,
  ...extra,
});

describe("history", () => {
  it("links to results or resume, for standalone and course quizzes", () => {
    expect(attemptAction(row({}))).toEqual({
      href: "/quizzes/js-assessment/results/a1",
      label: "Xem kết quả",
    });
    expect(attemptAction(row({ status: "IN_PROGRESS" }))).toEqual({
      href: "/quizzes/js-assessment/attempt",
      label: "Tiếp tục",
    });
    // Expired: its result auto-submits it.
    expect(
      attemptAction(row({ status: "IN_PROGRESS", isExpired: true }))!.label,
    ).toBe("Xem kết quả");
    expect(
      attemptAction(row({ scope: "LESSON", quizSlug: null, courseSlug: "ts" })),
    ).toEqual({
      href: "/learn/ts/quiz/z1?result=a1",
      label: "Xem kết quả",
    });
    expect(attemptBadge(row({ status: "TIMED_OUT", isPassed: false }))).toEqual(
      { tone: "warning", label: "Timed Out" },
    );
    expect(attemptBadge(row({ isPassed: false })).label).toBe("Failed");
  });

  it("renders the table and switches tabs", async () => {
    routes["GET /api/v1/student/quiz-attempts"] = () => [
      {
        success: true,
        statusCode: 200,
        message: "OK",
        data: [
          row({}),
          row({
            attemptId: "a0",
            scope: "COURSE",
            quizSlug: null,
            courseSlug: "ts",
            courseTitle: "TypeScript",
          }),
        ],
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
    ];
    render(<MyQuizAttempts />, { wrapper: wrapper() });
    const first = await screen.findByTestId("attempt-row-a1");
    expect(within(first).getByText("Standalone")).toBeInTheDocument();
    expect(within(first).getByText("30/40")).toBeInTheDocument();
    expect(within(first).getByText("75%")).toBeInTheDocument();
    expect(within(first).getByText("5 phút 30 giây")).toBeInTheDocument();
    expect(within(first).getByText("Passed")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("attempt-row-a0")).getByText(/TypeScript/),
    ).toBeInTheDocument();
    expect(calls[0]!.path).toBe(
      "/api/v1/student/quiz-attempts?scope=all&page=1&limit=20",
    );

    await userEvent.click(screen.getByRole("tab", { name: "Quiz độc lập" }));
    expect(replace).toHaveBeenCalledWith("/quiz-attempts?scope=standalone", {
      scroll: false,
    });
  });
});
