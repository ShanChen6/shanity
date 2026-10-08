import { Badge } from "@/components/ui/badge";
import type { AttemptResult } from "./api";

const points = (score: number, max: number) => `${score} / ${max}`;

const day = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(new Date(iso));

/**
 * Where the final score came from: MCQ part, each essay, total, percentage
 * and the PASS/FAIL badge. Shown only for a COMPLETED attempt; every number
 * is the server's (the client adds nothing up).
 */
export function QuizResultSummary({ result }: { result: AttemptResult }) {
  const { breakdown } = result;
  if (result.status !== "COMPLETED" || !breakdown) return null;
  const { mcq, essay, total } = breakdown;
  const hasEssays = essay.questions.length > 0;
  return (
    <section
      aria-label="Phân tích điểm"
      data-testid="quiz-result-summary"
      className="rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold">Phân tích điểm</h2>
      {result.adjustment ? (
        <div
          data-testid="adjustment-notice"
          className="mt-3 rounded-md border border-warning/40 bg-warning-background p-3 text-sm"
        >
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Đã điều chỉnh điểm</Badge>
            <span>
              Điểm số đã được cập nhật bởi Giảng viên vào{" "}
              {day(result.adjustment.lastAdjustedAt)}.
            </span>
          </p>
          {result.adjustment.adjustments.some(({ reason }) => reason) ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">
                Xem lý do điều chỉnh
              </summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {result.adjustment.adjustments.map((item) =>
                  item.reason ? (
                    <li key={`${item.adjustedAt}-${item.reason}`}>
                      {day(item.adjustedAt)}: {item.reason}
                    </li>
                  ) : null,
                )}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <dl className="mt-3 divide-y divide-border text-sm">
        <div className="flex justify-between gap-4 py-2">
          <dt className="font-medium">MCQ Score</dt>
          <dd className="tabular-nums" data-testid="mcq-score">
            {points(mcq.score, mcq.maxScore)}
          </dd>
        </div>
        {hasEssays ? (
          <div className="py-2">
            <div className="flex justify-between gap-4">
              <dt className="font-medium">Essay Score</dt>
              <dd className="tabular-nums" data-testid="essay-score">
                {points(essay.score, essay.maxScore)}
              </dd>
            </div>
            <ul className="mt-2 space-y-2 pl-4">
              {essay.questions.map((question) => (
                <li key={question.questionId}>
                  <div className="flex justify-between gap-4 text-muted">
                    <span>Question {question.number}</span>
                    <span className="tabular-nums">
                      {points(question.awardedPoints, question.maxScore)}
                    </span>
                  </div>
                  {question.feedback ? (
                    <p className="mt-1 whitespace-pre-line rounded-md bg-surface-secondary p-2 text-foreground">
                      <strong>Nhận xét:</strong> {question.feedback}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 py-2 font-semibold">
          <dt>Total Score</dt>
          <dd className="tabular-nums" data-testid="total-score">
            {points(total.score, total.maxScore)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="font-medium">Percentage</dt>
          <dd className="tabular-nums" data-testid="summary-percentage">
            {breakdown.percentage.toFixed(2)}%
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="font-medium">Status</dt>
          <dd>
            <Badge tone={breakdown.isPassed ? "success" : "danger"}>
              {breakdown.isPassed ? "PASS" : "FAIL"}
            </Badge>
          </dd>
        </div>
      </dl>
    </section>
  );
}
