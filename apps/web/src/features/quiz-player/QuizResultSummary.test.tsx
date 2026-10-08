import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AttemptResult } from "./api";
import { QuizResultSummary } from "./QuizResultSummary";

const result = (extra: Partial<AttemptResult> = {}): AttemptResult => ({
  attemptId: "a1",
  quizId: "q1",
  quizTitle: "Mixed exam",
  status: "COMPLETED",
  scoreVisible: true,
  score: {
    earnedPoints: 25,
    totalPoints: 30,
    percentage: 83.33,
    passingScore: 80,
    passed: true,
  },
  breakdown: {
    mcq: { score: 18, maxScore: 20 },
    essay: {
      score: 7,
      maxScore: 10,
      questions: [
        {
          questionId: "e1",
          number: 3,
          awardedPoints: 4,
          maxScore: 5,
          feedback: "Clear method",
        },
        {
          questionId: "e2",
          number: 4,
          awardedPoints: 3,
          maxScore: 5,
          feedback: "",
        },
      ],
    },
    total: { score: 25, maxScore: 30 },
    percentage: 83.33,
    isPassed: true,
  },
  attemptInfo: {
    currentAttempt: 1,
    maxAttempts: null,
    startedAt: "2026-10-08T03:00:00.000Z",
    submittedAt: "2026-10-08T03:10:00.000Z",
  },
  reviewPolicy: "AFTER_SUBMIT",
  reviewAllowed: true,
  questions: [],
  ...extra,
});

describe("QuizResultSummary", () => {
  it("breaks the score down into MCQ, each essay, total, percentage and PASS", () => {
    render(<QuizResultSummary result={result()} />);
    const summary = screen.getByTestId("quiz-result-summary");
    expect(within(summary).getByTestId("mcq-score")).toHaveTextContent(
      "18 / 20",
    );
    expect(within(summary).getByTestId("essay-score")).toHaveTextContent(
      "7 / 10",
    );
    expect(within(summary).getByText("Question 3")).toBeInTheDocument();
    expect(within(summary).getByText("4 / 5")).toBeInTheDocument();
    expect(within(summary).getByText("3 / 5")).toBeInTheDocument();
    expect(within(summary).getByText(/Clear method/)).toBeInTheDocument();
    expect(within(summary).getByTestId("total-score")).toHaveTextContent(
      "25 / 30",
    );
    expect(within(summary).getByTestId("summary-percentage")).toHaveTextContent(
      "83.33%",
    );
    expect(within(summary).getByText("PASS")).toBeInTheDocument();
  });

  it("shows FAIL, and omits the essay block for an all-MCQ quiz", () => {
    const base = result();
    render(
      <QuizResultSummary
        result={{
          ...base,
          breakdown: {
            ...base.breakdown!,
            essay: { score: 0, maxScore: 0, questions: [] },
            percentage: 50,
            isPassed: false,
          },
        }}
      />,
    );
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.queryByTestId("essay-score")).toBeNull();
  });

  it("renders nothing until the attempt is COMPLETED", () => {
    const { container } = render(
      <QuizResultSummary
        result={result({
          status: "NEEDS_GRADING",
          scoreVisible: false,
          score: null,
          breakdown: undefined,
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    // Even a stray breakdown is not shown for another status.
    const stray = render(
      <QuizResultSummary result={result({ status: "NEEDS_GRADING" })} />,
    );
    expect(stray.container).toBeEmptyDOMElement();
  });
});
