"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Clock,
  Eye,
  ListChecks,
  Lock,
  RotateCcw,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Failure } from "@/features/instructor/shared";
import { startAttempt } from "@/features/quiz-player/api";
import { ApiError, errorMessage } from "@/lib/api";
import {
  DIFFICULTY_LABEL,
  REVIEW_LABEL,
  attemptHref,
  detailKey,
  resultHref,
  useStandaloneDetail,
  type StandaloneDetail,
} from "./api";

export function primaryAction(quiz: StandaloneDetail) {
  if (quiz.hasActiveAttempt) return "resume" as const;
  if (quiz.attemptsRemaining === 0) return "exhausted" as const;
  return "start" as const;
}

function Spec({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <span className="mt-0.5 text-muted" aria-hidden>
        {icon}
      </span>
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-semibold">{value}</dd>
      </div>
    </div>
  );
}

export function QuizLanding({ slug }: { slug: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const detail = useStandaloneDetail(slug);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (detail.isPending)
    return (
      <main className="container space-y-4 py-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  if (detail.error)
    return (
      <main className="container py-12">
        {detail.error instanceof ApiError &&
        detail.error.code === "QUIZ_FORBIDDEN" ? (
          <div className="mx-auto max-w-md space-y-3 text-center">
            <h1 className="text-xl font-semibold">Không tìm thấy bài quiz</h1>
            <p className="text-sm text-muted">
              Bài quiz không tồn tại hoặc chưa được xuất bản.
            </p>
            <Link href="/quizzes" className="text-primary underline">
              Về danh sách quiz
            </Link>
          </div>
        ) : (
          <Failure error={detail.error} retry={() => void detail.refetch()} />
        )}
      </main>
    );

  const quiz = detail.data;
  const action = primaryAction(quiz);

  async function begin() {
    setStarting(true);
    setError(null);
    try {
      // Starting twice resumes the running attempt, never forks one.
      await startAttempt(quiz.id);
      await client.invalidateQueries({ queryKey: detailKey(slug) });
      router.push(attemptHref(slug));
    } catch (reason) {
      setError(reason);
      setStarting(false);
    }
  }

  return (
    <main className="container grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-6">
        <Link
          href="/quizzes"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Danh sách quiz
        </Link>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">Standalone</Badge>
            {quiz.difficulty ? (
              <Badge tone="neutral">{DIFFICULTY_LABEL[quiz.difficulty]}</Badge>
            ) : null}
            {quiz.tags.map((tag) => (
              <Link
                key={tag}
                href={`/quizzes?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-foreground-secondary hover:bg-surface-hover"
              >
                #{tag}
              </Link>
            ))}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {quiz.title}
          </h1>
          {quiz.description ? (
            <p className="whitespace-pre-line text-lg text-muted">
              {quiz.description}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Spec
            icon={<Clock size={18} />}
            label="Thời gian làm bài"
            value={
              quiz.durationMinutes
                ? `${quiz.durationMinutes} phút`
                : "Không giới hạn"
            }
          />
          <Spec
            icon={<Target size={18} />}
            label="Điểm đạt"
            value={`${quiz.passingScore}%`}
          />
          <Spec
            icon={<ListChecks size={18} />}
            label="Câu hỏi"
            value={`${quiz.totalQuestions} câu · ${quiz.totalPoints} điểm`}
          />
          <Spec
            icon={<RotateCcw size={18} />}
            label="Số lượt tối đa"
            value={
              quiz.maxAttempts === null
                ? "Không giới hạn"
                : `${quiz.maxAttempts} lượt`
            }
          />
          <Spec
            icon={<Eye size={18} />}
            label="Xem lại bài"
            value={REVIEW_LABEL[quiz.reviewPolicy] ?? quiz.reviewPolicy}
          />
        </dl>
        {quiz.durationMinutes ? (
          <p className="text-sm text-muted">
            Đồng hồ chạy theo máy chủ và không dừng khi bạn rời trang. Hết giờ,
            bài sẽ tự động được nộp với các đáp án đã lưu.
          </p>
        ) : null}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section
          aria-label="Kết quả của bạn"
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <Award aria-hidden size={18} /> Kết quả của bạn
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Đã thử</dt>
              <dd
                className="text-lg font-semibold tabular-nums"
                data-testid="attempts-used"
              >
                {quiz.attemptsUsed}
                {quiz.maxAttempts !== null ? `/${quiz.maxAttempts}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Điểm cao nhất</dt>
              <dd
                className="text-lg font-semibold tabular-nums"
                data-testid="highest-score"
              >
                {quiz.highestPercentage === null
                  ? "—"
                  : `${quiz.highestPercentage}%`}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Lần gần nhất</dt>
              <dd className="mt-1">
                {quiz.latestResult ? (
                  <Link
                    href={resultHref(slug, quiz.latestResult.attemptId)}
                    className="inline-flex items-center gap-2 hover:underline"
                  >
                    <Badge
                      tone={quiz.latestResult.passed ? "success" : "danger"}
                    >
                      {quiz.latestResult.passed ? "Đạt" : "Chưa đạt"}
                    </Badge>
                    <span className="tabular-nums">
                      {quiz.latestResult.percentage}%
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted">Chưa có</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <div className="space-y-2">
          {action === "resume" ? (
            <Button
              size="lg"
              className="w-full"
              onClick={() => router.push(attemptHref(slug))}
            >
              Tiếp tục Làm bài
            </Button>
          ) : action === "exhausted" ? (
            <>
              <Button size="lg" className="w-full" disabled>
                <Lock aria-hidden size={16} /> Bắt đầu Làm bài
              </Button>
              <p className="text-center text-sm text-muted" role="status">
                Đã hết số lượt làm bài.
              </p>
            </>
          ) : (
            <Button
              size="lg"
              className="w-full"
              loading={starting}
              onClick={() => void begin()}
            >
              {quiz.attemptsUsed ? "Làm lại" : "Bắt đầu Làm bài"}
            </Button>
          )}
          {error ? (
            <p
              role="alert"
              className="text-center text-sm text-danger-foreground"
            >
              {error instanceof ApiError &&
              error.code === "MAX_ATTEMPTS_REACHED"
                ? "Đã hết số lượt làm bài."
                : errorMessage(error)}
            </p>
          ) : null}
          <Link
            href="/my-quiz-attempts?scope=standalone"
            className="block text-center text-sm text-muted hover:text-foreground"
          >
            Xem lịch sử làm bài
          </Link>
        </div>
      </aside>
    </main>
  );
}
