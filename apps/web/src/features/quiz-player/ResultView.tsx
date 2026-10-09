import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Timer,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttemptResult } from "./api";

const POLICY_HINT: Record<string, string> = {
  NEVER: "Giảng viên không công bố đáp án của bài quiz này.",
  AFTER_PASS: "Đáp án đúng và giải thích sẽ hiện khi bạn đạt bài quiz.",
  AFTER_EXHAUSTED: "Đáp án đúng sẽ hiện khi bạn dùng hết lượt làm bài.",
};

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} phút ${rest} giây` : `${rest} giây`;
}

const elapsedSeconds = (result: AttemptResult) =>
  result.attemptInfo.submittedAt
    ? Math.round(
        (Date.parse(result.attemptInfo.submittedAt) -
          Date.parse(result.attemptInfo.startedAt)) /
          1000,
      )
    : null;

/** True while essays await the instructor: no score may be shown. */
export const isPendingGrading = (result: AttemptResult) =>
  result.status === "NEEDS_GRADING" || result.score === null;

/** Summary banner: score, percentage, pass/fail, time taken. */
export function ResultBanner({
  result,
  children,
}: {
  result: AttemptResult;
  children?: ReactNode;
}) {
  if (isPendingGrading(result))
    return (
      <section
        aria-label="Kết quả"
        data-testid="pending-grading"
        className="overflow-hidden rounded-xl border border-warning/40 bg-warning-background"
      >
        <div className="flex flex-wrap items-center gap-5 p-5 sm:p-7">
          <Hourglass
            aria-hidden
            size={48}
            className="text-warning-foreground"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm text-muted">
              {result.quizTitle} · Lượt {result.attemptInfo.currentAttempt}
            </p>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              Bài làm đã được nộp
              <Badge tone="warning">Chờ chấm</Badge>
            </h1>
            <p className="text-sm">
              Bài thi của bạn đã nộp và đang trong quá trình duyệt/công bố điểm.
              Kết quả sẽ hiện ở đây sau khi Giảng viên chấm xong và công bố.
            </p>
          </div>
        </div>
        {children ? (
          <div className="flex flex-wrap gap-3 border-t border-border/60 bg-surface/60 p-4">
            {children}
          </div>
        ) : null}
      </section>
    );
  const score = result.score!;
  const { passed } = score;
  return (
    <section
      aria-label="Kết quả"
      className={cn(
        "overflow-hidden rounded-xl border",
        passed
          ? "border-success/40 bg-success-background"
          : "border-danger/40 bg-danger-background",
      )}
    >
      <div className="flex flex-wrap items-center gap-5 p-5 sm:p-7">
        {passed ? (
          <CheckCircle2 aria-hidden size={48} className="text-success" />
        ) : (
          <XCircle aria-hidden size={48} className="text-danger-foreground" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-muted">
            {result.quizTitle} · Lượt {result.attemptInfo.currentAttempt}
            {result.attemptInfo.maxAttempts
              ? `/${result.attemptInfo.maxAttempts}`
              : ""}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold sm:text-3xl">
            {passed ? "Bạn đã đạt!" : "Chưa đạt"}
            <Badge tone={passed ? "success" : "danger"}>
              {passed ? "PASSED" : "FAILED"}
            </Badge>
          </h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Timer aria-hidden size={14} />{" "}
              {formatDuration(elapsedSeconds(result))}
            </span>
            <span>Cần {score.passingScore}% để đạt</span>
          </p>
          {result.notice === "ATTEMPT_TIMED_OUT" ? (
            <p className="flex items-center gap-1 text-sm">
              <AlertTriangle aria-hidden size={14} /> Hết giờ: bài đã được tự
              động nộp.
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p
            className="text-5xl font-semibold tabular-nums"
            data-testid="quiz-percentage"
          >
            {score.percentage}%
          </p>
          <p className="text-sm text-muted tabular-nums">
            {score.earnedPoints}/{score.totalPoints} điểm
          </p>
        </div>
      </div>
      {children ? (
        <div className="flex flex-wrap gap-3 border-t border-border/60 bg-surface/60 p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Per-question review, as much as the frozen review policy allows. */
export function ReviewList({ result }: { result: AttemptResult }) {
  return (
    <section className="space-y-4" aria-label="Chi tiết bài làm">
      <h2 className="text-lg font-semibold">Chi tiết bài làm</h2>
      {!result.reviewAllowed ? (
        <p className="rounded-md border border-border bg-surface-secondary p-3 text-sm text-muted">
          {POLICY_HINT[result.reviewPolicy] ?? "Đáp án đúng chưa được công bố."}
        </p>
      ) : null}
      <ol className="space-y-4">
        {result.questions.map((question, index) => {
          const selected = new Set(question.selectedOptionIds);
          return (
            <li
              key={question.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
                <span>
                  Câu {index + 1} · {question.points} điểm
                </span>
                {question.isCorrect === null ? null : question.isCorrect ? (
                  <Badge tone="success">Đúng · +{question.pointsEarned}</Badge>
                ) : (
                  <Badge tone="danger">
                    {selected.size ? "Sai" : "Chưa trả lời"} · 0
                  </Badge>
                )}
              </div>
              <p className="mt-2 whitespace-pre-line font-medium">
                {question.content}
              </p>
              <ul className="mt-3 space-y-2">
                {question.options.map((option) => {
                  const chosen = selected.has(option.id);
                  const tone =
                    option.isCorrect === true
                      ? "border-success/60 bg-success-background"
                      : chosen && option.isCorrect === false
                        ? "border-danger/60 bg-danger-background"
                        : chosen
                          ? "border-primary bg-secondary"
                          : "border-border";
                  return (
                    <li
                      key={option.id}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 text-sm",
                        tone,
                      )}
                    >
                      <span className="min-w-0 flex-1">{option.content}</span>
                      {chosen ? <Badge tone="info">Bạn chọn</Badge> : null}
                      {option.isCorrect ? (
                        <Badge tone="success">Đáp án đúng</Badge>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {question.explanation ? (
                <p className="mt-3 rounded-md bg-surface-secondary p-3 text-sm">
                  <strong>Giải thích:</strong> {question.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
