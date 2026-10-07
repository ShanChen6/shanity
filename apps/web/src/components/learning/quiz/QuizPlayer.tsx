"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Clock, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/session-provider";
import { Failure } from "@/features/instructor/shared";
import { refreshCourseProgress } from "@/features/progress/use-course-progress";
import { broadcastProgressChanged } from "@/features/progress/progress-sync";
import {
  courseQuizzesKey,
  startAttempt,
  useAttemptResult,
  type Attempt,
  type CourseQuiz,
} from "@/features/quiz-player/api";
import { ApiError, errorMessage } from "@/lib/api";
import { CourseCompletedDialog } from "../CourseCompletedDialog";
import { useLearning } from "../learning-context";
import { learningPath } from "../learning-model";
import { NotFoundCard } from "../states/NotFoundCard";
import { LessonSkeleton } from "../states/LessonSkeleton";
import { AttemptRunner } from "@/features/quiz-player/AttemptRunner";
import { ResultBanner, ReviewList } from "@/features/quiz-player/ResultView";
import { canRetry, nextLessonAfterQuiz, stepCompletedBy } from "./quiz-flow";

type Phase =
  | { kind: "intro" }
  | { kind: "taking"; attempt: Attempt }
  | { kind: "result"; attemptId: string };

/** /learn/[courseSlug]/quiz/[quizId]: intro -> taking -> result. */
export function QuizPlayer({
  quizId,
  resultAttemptId,
}: {
  quizId: string;
  // From /my-quiz-attempts: open straight on that attempt's result.
  resultAttemptId?: string;
}) {
  const learning = useLearning();
  const quiz = learning.quizzes.find(({ id }) => id === quizId);
  const [phase, setPhase] = useState<Phase>(() =>
    resultAttemptId
      ? { kind: "result", attemptId: resultAttemptId }
      : { kind: "intro" },
  );

  if (!quiz)
    return learning.quizzes.length || !learning.isTracking ? (
      <NotFoundCard scope="lesson" />
    ) : (
      <LessonSkeleton />
    );
  if (phase.kind === "taking")
    return (
      <QuizTaking
        key={phase.attempt.id}
        quiz={quiz}
        attempt={phase.attempt}
        onClosed={(attemptId) => setPhase({ kind: "result", attemptId })}
      />
    );
  if (phase.kind === "result")
    return (
      <QuizResultView
        quiz={quiz}
        attemptId={phase.attemptId}
        onRetry={(attempt) => setPhase({ kind: "taking", attempt })}
      />
    );
  return (
    <QuizIntro
      quiz={quiz}
      onStarted={(attempt) =>
        attempt.status === "IN_PROGRESS"
          ? setPhase({ kind: "taking", attempt })
          : setPhase({ kind: "result", attemptId: attempt.id })
      }
      onShowResult={(attemptId) => setPhase({ kind: "result", attemptId })}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-secondary p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

function QuizIntro({
  quiz,
  onStarted,
  onShowResult,
}: {
  quiz: CourseQuiz;
  onStarted: (attempt: Attempt) => void;
  onShowResult: (attemptId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { isQuizLocked } = useLearning();
  const locked = isQuizLocked(quiz);
  const retryAllowed = canRetry(quiz);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      onStarted(await startAttempt(quiz.id));
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info" className="gap-1">
            <ClipboardCheck aria-hidden size={14} /> Quiz
          </Badge>
          {quiz.isRequired ? <Badge tone="warning">Bắt buộc</Badge> : null}
          {quiz.status === "PASSED" ? (
            <Badge tone="success">Đã đạt</Badge>
          ) : null}
          {quiz.status === "FAILED" ? (
            <Badge tone="danger">Chưa đạt</Badge>
          ) : null}
        </div>
        <h2 className="text-2xl font-semibold">{quiz.title}</h2>
        {quiz.description ? (
          <p className="text-muted">{quiz.description}</p>
        ) : null}
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Câu hỏi"
          value={`${quiz.totalQuestions} câu · ${quiz.totalPoints} điểm`}
        />
        <Stat label="Điểm đạt" value={`${quiz.passingScore}%`} />
        <Stat
          label="Thời gian"
          value={
            quiz.durationMinutes
              ? `${quiz.durationMinutes} phút`
              : "Không giới hạn"
          }
        />
        <Stat
          label="Lượt làm"
          value={
            quiz.maxAttempts === null
              ? `${quiz.attemptsUsed} · không giới hạn`
              : `${quiz.attemptsUsed}/${quiz.maxAttempts}`
          }
        />
      </dl>
      {quiz.isRequired ? (
        <p className="rounded-md border border-warning/40 bg-warning-background p-3 text-sm text-warning-foreground">
          Bài quiz bắt buộc: bạn cần đạt từ {quiz.passingScore}% để được tính
          hoàn thành và mở khóa nội dung tiếp theo.
        </p>
      ) : null}
      {quiz.durationMinutes ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Clock aria-hidden size={16} className="mt-0.5 shrink-0" />
          Đồng hồ tính theo máy chủ và không dừng khi bạn rời trang. Hết giờ,
          bài sẽ tự động được nộp với các câu đã lưu.
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-background p-3 text-sm text-danger-foreground"
        >
          {startError(error)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {quiz.hasActiveAttempt ? (
          <Button loading={busy} disabled={locked} onClick={() => void start()}>
            Tiếp tục làm bài
          </Button>
        ) : retryAllowed ? (
          <Button loading={busy} disabled={locked} onClick={() => void start()}>
            {quiz.attemptsUsed ? "Làm lại" : "Bắt đầu làm bài"}
          </Button>
        ) : (
          <p className="text-sm text-muted">Bạn đã dùng hết lượt làm bài.</p>
        )}
        {quiz.latestAttemptId ? (
          <Button
            variant="outline"
            onClick={() => onShowResult(quiz.latestAttemptId!)}
          >
            Xem kết quả gần nhất
          </Button>
        ) : null}
      </div>
      {locked ? (
        <p className="text-sm text-muted">
          Hoàn thành các bài học trước để mở khóa bài quiz này.
        </p>
      ) : null}
    </article>
  );
}

function startError(error: unknown) {
  if (error instanceof ApiError)
    switch (error.code) {
      case "MAX_ATTEMPTS_REACHED":
        return "Bạn đã dùng hết lượt làm bài.";
      case "TARGET_COURSE_FORBIDDEN":
        return "Bạn chưa có quyền làm bài quiz này (cần đăng ký khóa học).";
      case "PREREQUISITE_LESSON_NOT_COMPLETED":
        return "Hãy hoàn thành các bài học trước để mở khóa bài quiz.";
      case "QUIZ_FORBIDDEN":
        return "Bài quiz hiện không khả dụng.";
      case "SUBMISSION_IN_PROGRESS":
        return "Bài làm trước đang được chấm. Vui lòng thử lại sau giây lát.";
    }
  return errorMessage(error);
}

/** The shared runner, plus course progress refresh once the attempt closes. */
function QuizTaking({
  quiz,
  attempt,
  onClosed,
}: {
  quiz: CourseQuiz;
  attempt: Attempt;
  onClosed: (attemptId: string) => void;
}) {
  const client = useQueryClient();
  const { user } = useSession();
  const learning = useLearning();
  const courseId = learning.syllabus.course.id;
  const settle = useCallback(
    (attemptId: string) => {
      refreshCourseProgress(client, courseId);
      void client.invalidateQueries({
        queryKey: courseQuizzesKey(courseId, user?.id),
      });
      broadcastProgressChanged(courseId);
      onClosed(attemptId);
    },
    [client, courseId, user?.id, onClosed],
  );
  return (
    <AttemptRunner title={quiz.title} attempt={attempt} onClosed={settle} />
  );
}

function QuizResultView({
  quiz,
  attemptId,
  onRetry,
}: {
  quiz: CourseQuiz;
  attemptId: string;
  onRetry: (attempt: Attempt) => void;
}) {
  const router = useRouter();
  const learning = useLearning();
  const result = useAttemptResult(attemptId);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<unknown>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [before] = useState(learning.courseProgress.percentage);
  const completedCourse =
    learning.isTracking &&
    before < 100 &&
    learning.courseProgress.percentage >= 100;

  if (result.isPending) return <LessonSkeleton />;
  if (result.error)
    return (
      <div className="p-6">
        <Failure error={result.error} retry={() => void result.refetch()} />
      </div>
    );

  const data = result.data;
  const passed = data.score.passed;
  const done = stepCompletedBy(quiz, passed);
  const next = nextLessonAfterQuiz(learning.curriculum, quiz);
  const nextLocked = next ? learning.isLocked(next) : false;

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const attempt = await startAttempt(quiz.id);
      if (attempt.status === "IN_PROGRESS") onRetry(attempt);
    } catch (error) {
      setRetryError(error);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-6">
      <ResultBanner result={data} />
      <section
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
        aria-label="Bước tiếp theo"
      >
        {done ? (
          <p className="text-sm">
            {quiz.isRequired
              ? "Bài quiz bắt buộc đã hoàn thành."
              : passed
                ? "Đã hoàn thành bài quiz."
                : "Bài quiz không bắt buộc: đã được tính hoàn thành dù chưa đạt."}
          </p>
        ) : (
          <p className="text-sm text-danger-foreground">
            Bài quiz bắt buộc: bạn cần đạt từ {data.score.passingScore}% để tiếp
            tục.
            {canRetry(quiz)
              ? " Hãy xem lại bài học và làm lại."
              : " Bạn đã hết lượt làm bài, hãy liên hệ giảng viên."}
          </p>
        )}
        {retryError ? (
          <p className="text-sm text-danger-foreground">
            {startError(retryError)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {done && next ? (
            <Button
              disabled={nextLocked}
              onClick={() =>
                router.push(learningPath(learning.courseSlug, next.slug))
              }
            >
              Tiếp tục: {next.title}
            </Button>
          ) : null}
          {!passed && canRetry(quiz) ? (
            <Button
              variant={done ? "outline" : "primary"}
              loading={retrying}
              onClick={() => void retry()}
            >
              <RotateCcw aria-hidden size={16} /> Làm lại
            </Button>
          ) : null}
          {quiz.scope === "LESSON" ? (
            <Link
              href={learningPath(
                learning.courseSlug,
                learning.curriculum
                  .flatMap(({ lessons }) => lessons)
                  .find(({ id }) => id === quiz.targetId)?.slug ?? "",
              )}
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 text-sm font-semibold hover:bg-surface-hover"
            >
              Xem lại bài học
            </Link>
          ) : null}
        </div>
      </section>

      <ReviewList result={data} />

      {completedCourse && !celebrated ? (
        <CourseCompletedDialog
          courseTitle={learning.syllabus.course.title}
          onClose={() => setCelebrated(true)}
        />
      ) : null}
    </article>
  );
}
