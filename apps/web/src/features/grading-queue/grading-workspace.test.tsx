import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingWorkspace } from "./GradingWorkspace";
import {
  awardedOf,
  gradeIssue,
  gradesPayload,
  initialInputs,
  type EssayQuestionView,
  type GradingAttempt,
} from "./model";

const essay = (
  id: string,
  extra: Partial<EssayQuestionView> = {},
): EssayQuestionView => ({
  id,
  type: "ESSAY",
  content: `Prove $a^2$ (${id})`,
  points: 5,
  maxWords: null,
  gradingGuide: "Award for a correct derivation",
  rubric: null,
  essayAnswer: { text: "Because $x$", attachments: [] },
  grading: { status: "UNGRADED", awardedPoints: null },
  ...extra,
});

const attempt = (questions: EssayQuestionView[]): GradingAttempt => ({
  attemptId: "a1",
  status: "NEEDS_GRADING",
  publishedAt: null,
  submittedAt: "2026-10-08T03:00:00.000Z",
  student: { id: "s1", fullName: "An Nguyen", email: "an@example.test" },
  quiz: { id: "q1", title: "Midterm" },
  course: { id: "c1", title: "Course A", slug: "course-a" },
  totalEssays: questions.length,
  pendingEssaysCount: questions.length,
  questions,
});

describe("grading model", () => {
  const rubric = [
    { criterion: "Method", maxPoints: 3 },
    { criterion: "Result", maxPoints: 2 },
  ];

  it("hints at out-of-range, negative and fractional scores", () => {
    const question = essay("e1");
    const input = (points: string) => ({ points, feedback: "", rubric: [] });
    expect(gradeIssue(question, input("4"))).toBeNull();
    expect(gradeIssue(question, input(""))).toBeNull();
    expect(gradeIssue(question, input("10"))).toBe(
      "Điểm tối đa của câu này là 5.",
    );
    expect(gradeIssue(question, input("-2"))).toBe("Điểm không được âm.");
    expect(gradeIssue(question, input("2.5"))).toBe("Điểm phải là số nguyên.");
  });

  it("sums rubric criteria and caps each at its own maximum", () => {
    const question = essay("e1", { rubric });
    const input = { points: "", feedback: "", rubric: ["2", "1"] };
    expect(awardedOf(question, input)).toBe(3);
    expect(gradeIssue(question, { ...input, rubric: ["4", "0"] })).toContain(
      "tối đa 3",
    );
  });

  it("sends only the questions the grader filled in", () => {
    const data = attempt([essay("e1"), essay("e2", { rubric })]);
    const inputs = initialInputs(data);
    expect(gradesPayload(data, inputs)).toEqual([]);
    inputs.e1 = { points: "4", feedback: " ok ", rubric: [] };
    inputs.e2 = { points: "", feedback: "", rubric: ["2", ""] };
    expect(gradesPayload(data, inputs)).toEqual([
      { questionId: "e1", awardedPoints: 4, feedback: "ok" },
      {
        questionId: "e2",
        awardedPoints: 2,
        rubricScores: [{ criterionIndex: 0, score: 2 }],
      },
    ]);
  });

  it("starts from a saved grade", () => {
    const data = attempt([
      essay("e1", {
        grading: {
          status: "GRADED",
          awardedPoints: 4,
          rubricScores: [],
          feedback: "Good",
          gradedAt: "2026-10-08T04:00:00.000Z",
        },
      }),
    ]);
    expect(initialInputs(data).e1).toMatchObject({
      points: "4",
      feedback: "Good",
    });
  });
});

const API = "http://localhost:4000";
let posts: Array<{ url: string; body: unknown }>;
let reply: { status: number; body: unknown };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("GradingWorkspace", () => {
  beforeEach(() => {
    posts = [];
    reply = {
      status: 200,
      body: {
        attemptId: "a1",
        status: "NEEDS_GRADING",
        remainingUngradedCount: 1,
        result: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input).replace(API, "");
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });
        if (init?.method === "POST") {
          posts.push({ url, body: JSON.parse(String(init.body)) });
          return json(reply.status, reply.body);
        }
        return json(200, attempt([essay("e1"), essay("e2")]));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the student, the answer, the guide and the maximum score", async () => {
    render(<GradingWorkspace attemptId="a1" />, { wrapper });
    const header = await screen.findByTestId("grading-header");
    expect(header).toHaveTextContent("An Nguyen");
    expect(header).toHaveTextContent("an@example.test");
    expect(header).toHaveTextContent("Midterm");
    expect(header).toHaveTextContent("Course A");
    const first = screen.getByRole("article", { name: "Câu tự luận 1" });
    expect(within(first).getByText(/Because/)).toBeInTheDocument();
    expect(
      within(first).getByText("Award for a correct derivation"),
    ).toBeInTheDocument();
    expect(within(first).getByText("/ 5")).toBeInTheDocument();
    expect(document.querySelector(".katex")).not.toBeNull();
  });

  it("saves the entered grade and confirms with a toast", async () => {
    const user = userEvent.setup();
    render(<GradingWorkspace attemptId="a1" />, { wrapper });
    await screen.findByTestId("grading-header");
    const save = screen.getByRole("button", { name: "Save Grade" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Điểm câu 1"), "4");
    await user.type(screen.getAllByLabelText("Feedback")[0]!, "Well done");
    await user.click(save);

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/instructor/quiz-attempts/a1/grade",
      body: {
        grades: [
          { questionId: "e1", awardedPoints: 4, feedback: "Well done" },
        ],
      },
    });
    expect(await screen.findByText(/Đã lưu điểm\. Còn 1 câu/)).toBeVisible();
  });

  it("blocks an over-max score locally and surfaces a server refusal", async () => {
    const user = userEvent.setup();
    render(<GradingWorkspace attemptId="a1" />, { wrapper });
    await screen.findByTestId("grading-header");
    await user.type(screen.getByLabelText("Điểm câu 1"), "10");
    expect(screen.getByRole("button", { name: "Save Grade" })).toBeDisabled();
    expect(screen.getByText("Điểm tối đa của câu này là 5.")).toBeVisible();

    // The server stays the authority when the client check is bypassed.
    reply = {
      status: 400,
      body: {
        statusCode: 400,
        message: "Awarded points (3) exceeds maximum allowed score (2)",
      },
    };
    await user.clear(screen.getByLabelText("Điểm câu 1"));
    await user.type(screen.getByLabelText("Điểm câu 1"), "3");
    await user.click(screen.getByRole("button", { name: "Save Grade" }));
    expect(
      await screen.findByText(
        "Awarded points (3) exceeds maximum allowed score (2)",
      ),
    ).toBeVisible();
  });
});
