import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingQueue } from "./GradingQueue";
import {
  groupByQuiz,
  pendingLabel,
  statusBadge,
  queueQuery,
  type GradingQueueItem,
} from "./model";

const item = (
  id: string,
  pending: number,
  extra: Partial<GradingQueueItem> = {},
): GradingQueueItem => ({
  attemptId: id,
  student: {
    id: `s-${id}`,
    fullName: `Student ${id}`,
    email: `${id}@example.test`,
    avatarUrl: null,
  },
  course: { id: "c1", title: "Course A", slug: "course-a" },
  quiz: { id: "q1", title: "Midterm" },
  submittedAt: "2026-10-08T03:00:00.000Z",
  totalEssays: 2,
  pendingEssaysCount: pending,
  status: pending ? "NEEDS_GRADING" : "GRADED",
  publishedAt: null,
  ...extra,
});

describe("grading queue model", () => {
  it("labels pending counts and graded rows", () => {
    expect(pendingLabel(item("a", 2))).toBe("2 essays pending");
    expect(pendingLabel(item("a", 1))).toBe("1 essay pending");
    expect(pendingLabel(item("a", 0))).toBe("Graded");
  });

  it("tells pending, graded-but-private and published apart", () => {
    expect(statusBadge(item("a", 2))).toEqual({
      tone: "warning",
      label: "2 essays pending",
    });
    expect(statusBadge(item("a", 0))).toEqual({
      tone: "neutral",
      label: "GRADED (Unpublished)",
    });
    expect(
      statusBadge(item("a", 0, { status: "COMPLETED", publishedAt: "2026-10-08T05:00:00.000Z" })),
    ).toEqual({ tone: "success", label: "PUBLISHED" });
  });

  it("groups by quiz and totals pending essays", () => {
    const groups = groupByQuiz([
      item("a", 2),
      item("b", 1),
      item("c", 0, { quiz: { id: "q2", title: "Final" } }),
    ]);
    expect(groups.map(({ quizTitle, pending }) => [quizTitle, pending])).toEqual(
      [
        ["Midterm", 3],
        ["Final", 0],
      ],
    );
  });

  it("omits ALL and empty filters from the query", () => {
    const filters = {
      courseId: "",
      quizId: "",
      status: "ALL" as const,
      search: "  ",
      page: 1,
    };
    expect(queueQuery(filters)).toBe("page=1&limit=20");
    expect(
      queueQuery({
        ...filters,
        courseId: "c1",
        status: "NEEDS_GRADING",
        search: " An ",
      }),
    ).toBe("page=1&limit=20&courseId=c1&status=NEEDS_GRADING&search=An");
  });
});

const API = "http://localhost:4000";
let urls: string[];
let posts: string[];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("GradingQueue screen", () => {
  beforeEach(() => {
    urls = [];
    posts = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input).replace(API, "");
        if (init?.method === "POST") posts.push(url);
        urls.push(url);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (url.startsWith("/instructor/grading-queue?"))
          return json({
            items: [item("a", 2), item("b", 0)],
            pagination: { page: 1, limit: 20, totalItems: 2, totalPages: 1 },
          });
        if (url.startsWith("/instructor/grading-queue/courses"))
          return json([{ id: "c1", title: "Course A", slug: "course-a" }]);
        if (url.startsWith("/admin/quizzes"))
          return json({ quizzes: [{ id: "q1", title: "Midterm" }] });
        return json({});
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows grouped students with badges and a grading link", async () => {
    render(<GradingQueue />, { wrapper });
    const group = await screen.findByRole("region", { name: "Midterm" });
    expect(within(group).getByText("2 essays pending")).toBeInTheDocument();
    expect(
      within(group).getByText("GRADED (Unpublished)"),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("link", { name: "Chấm bài" }),
    ).toHaveAttribute("href", "/instructor/grading/attempts/a");
    // Defaults to the actionable tab.
    expect(urls.some((url) => url.includes("status=NEEDS_GRADING"))).toBe(true);
  });

  it("publishes one result, or all graded results of a quiz after confirming", async () => {
    const user = userEvent.setup();
    render(<GradingQueue />, { wrapper });
    const group = await screen.findByRole("region", { name: "Midterm" });
    // Only the graded row offers a publish button.
    expect(within(group).getAllByRole("button", { name: "Publish Result" })).toHaveLength(1);

    await user.click(within(group).getByRole("button", { name: "Publish Result" }));
    await waitFor(() =>
      expect(posts).toEqual(["/instructor/quiz-attempts/b/publish"]),
    );

    await user.click(
      within(group).getByRole("button", {
        name: "Publish All Graded Results (1)",
      }),
    );
    // Nothing is sent until the instructor confirms.
    expect(posts).toHaveLength(1);
    await user.click(await screen.findByRole("button", { name: "Công bố" }));
    await waitFor(() =>
      expect(posts.at(-1)).toBe("/instructor/quizzes/q1/publish-results"),
    );
  });

  it("sends the chosen filters to the API", async () => {
    const user = userEvent.setup();
    render(<GradingQueue />, { wrapper });
    await screen.findByRole("region", { name: "Midterm" });

    await user.click(screen.getByRole("tab", { name: "Đã chấm" }));
    await waitFor(() =>
      expect(urls.at(-1)).toContain("status=GRADED"),
    );
    await user.selectOptions(screen.getByLabelText("Khóa học"), "c1");
    await waitFor(() => expect(urls.at(-1)).toContain("courseId=c1"));
    expect(screen.getByLabelText("Bài quiz")).toBeEnabled();
    await user.click(screen.getByRole("tab", { name: "Tất cả" }));
    await waitFor(() => expect(urls.at(-1)).not.toContain("status="));
  });
});
