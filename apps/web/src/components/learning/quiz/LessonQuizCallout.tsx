import Link from "next/link";
import { ClipboardCheck, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CourseQuiz } from "@/features/quiz-player/api";
import { quizPath } from "../learning-model";

const ACTION: Record<CourseQuiz["status"], string> = {
  NOT_STARTED: "Làm bài quiz",
  IN_PROGRESS: "Tiếp tục làm bài",
  PASSED: "Xem lại bài quiz",
  FAILED: "Làm lại bài quiz",
};

/** Below a lesson's content: its quiz, the step that follows the lesson. */
export function LessonQuizCallout({
  courseSlug,
  quiz,
  locked,
}: {
  courseSlug: string;
  quiz: CourseQuiz;
  locked: boolean;
}) {
  return (
    <aside
      data-testid={`lesson-quiz-${quiz.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <ClipboardCheck aria-hidden size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {quiz.title}
          {quiz.isRequired ? <Badge tone="warning">Bắt buộc</Badge> : null}
          {quiz.status === "PASSED" ? <Badge tone="success">Đạt</Badge> : null}
          {quiz.status === "FAILED" ? (
            <Badge tone="danger">Chưa đạt</Badge>
          ) : null}
        </p>
        <p className="text-sm text-muted">
          {quiz.totalQuestions} câu · cần {quiz.passingScore}%
          {quiz.isRequired && !quiz.isPassed
            ? " · cần đạt để mở khóa bài tiếp theo"
            : ""}
        </p>
      </div>
      {locked ? (
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <Lock aria-hidden size={16} /> Đang khóa
        </span>
      ) : (
        <Link
          href={quizPath(courseSlug, quiz.id)}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {ACTION[quiz.status]}
        </Link>
      )}
    </aside>
  );
}
