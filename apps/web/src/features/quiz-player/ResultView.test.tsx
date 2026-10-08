import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { attemptBadge } from "@/features/standalone-quiz/MyQuizAttempts";
import type { MyAttempt } from "@/features/standalone-quiz/api";
import type { AttemptResult } from "./api";
import { ResultBanner } from "./ResultView";

const base: AttemptResult = {
  attemptId: "a1",
  quizId: "q1",
  quizTitle: "Mixed exam",
  status: "COMPLETED",
  scoreVisible: true,
  score: {
    earnedPoints: 20,
    totalPoints: 20,
    percentage: 100,
    passingScore: 80,
    passed: true,
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
};

describe("ResultBanner", () => {
  it("shows the score and pass state for a COMPLETED attempt", () => {
    render(<ResultBanner result={base} />);
    expect(screen.getByTestId("quiz-percentage")).toHaveTextContent("100%");
    expect(screen.getByText("PASSED")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-grading")).toBeNull();
  });

  it("shows only the pending banner while NEEDS_GRADING", () => {
    render(
      <ResultBanner
        result={{
          ...base,
          status: "NEEDS_GRADING",
          scoreVisible: false,
          score: null,
          message:
            "Your submission is pending instructor review for essay questions.",
        }}
      />,
    );
    expect(screen.getByTestId("pending-grading")).toHaveTextContent(
      "Bài làm đã được nộp",
    );
    expect(screen.getByTestId("pending-grading")).toHaveTextContent(
      "Kết quả chi tiết sẽ được thông báo sau khi Giảng viên hoàn tất chấm điểm",
    );
    expect(screen.queryByTestId("quiz-percentage")).toBeNull();
    expect(screen.queryByText(/PASSED|FAILED/)).toBeNull();
    expect(screen.queryByText(/điểm$/)).toBeNull();
  });

  it("labels a pending attempt in the history list", () => {
    expect(
      attemptBadge({ status: "NEEDS_GRADING", isPassed: null } as MyAttempt),
    ).toEqual({ tone: "warning", label: "Chờ chấm" });
  });
});
