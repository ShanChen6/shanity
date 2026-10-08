"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Failure } from "@/features/instructor/shared";
import { QuizResultSummary } from "@/features/quiz-player/QuizResultSummary";
import {
  isPendingGrading,
  ResultBanner,
  ReviewList,
} from "@/features/quiz-player/ResultView";
import { startAttempt, useAttemptResult } from "@/features/quiz-player/api";
import { ApiError, errorMessage } from "@/lib/api";
import { attemptHref, detailKey, useStandaloneDetail } from "./api";

const linkClass =
  "inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 text-sm font-semibold hover:bg-surface-hover";

/** /quizzes/[slug]/results/[attemptId] */
export function StandaloneResult({
  slug,
  attemptId,
}: {
  slug: string;
  attemptId: string;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const result = useAttemptResult(attemptId);
  const detail = useStandaloneDetail(slug);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (result.isPending)
    return (
      <main className="container space-y-4 py-8">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (result.error)
    return (
      <main className="container py-8">
        {result.error instanceof ApiError &&
        result.error.code === "SUBMISSION_IN_PROGRESS" ? (
          <div className="space-y-3">
            <p>Bài đang được chấm…</p>
            <Button variant="outline" onClick={() => void result.refetch()}>
              Tải lại
            </Button>
          </div>
        ) : (
          <Failure error={result.error} retry={() => void result.refetch()} />
        )}
      </main>
    );

  const quiz = detail.data;
  const canRetry =
    quiz &&
    !quiz.hasActiveAttempt &&
    (quiz.attemptsRemaining === null || quiz.attemptsRemaining > 0);

  async function retry() {
    if (!quiz) return;
    setRetrying(true);
    setError(null);
    try {
      await startAttempt(quiz.id);
      await client.invalidateQueries({ queryKey: detailKey(slug) });
      router.push(attemptHref(slug));
    } catch (reason) {
      setError(reason);
      setRetrying(false);
    }
  }

  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <ResultBanner result={result.data}>
        {isPendingGrading(result.data) ? null : canRetry ? (
          <Button loading={retrying} onClick={() => void retry()}>
            <RotateCcw aria-hidden size={16} /> Làm lại Bài thi
          </Button>
        ) : quiz?.hasActiveAttempt ? (
          <Link href={attemptHref(slug)} className={linkClass}>
            Tiếp tục lượt đang làm
          </Link>
        ) : quiz ? (
          <span className="self-center text-sm text-muted">
            Đã hết số lượt làm bài.
          </span>
        ) : null}
        <Link href="/quizzes" className={linkClass}>
          Trở về Danh sách Quiz
        </Link>
        <Link href="/my-quiz-attempts" className={linkClass}>
          Xem Lịch sử Làm bài
        </Link>
      </ResultBanner>
      {error ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {errorMessage(error)}
        </p>
      ) : null}
      <QuizResultSummary result={result.data} />
      <ReviewList result={result.data} />
    </main>
  );
}
