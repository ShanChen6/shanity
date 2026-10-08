"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AttemptSkeleton } from "@/features/quiz-player/AttemptSkeleton";
import { Failure } from "@/features/instructor/shared";
import { AttemptRunner } from "@/features/quiz-player/AttemptRunner";
import type { Attempt } from "@/features/quiz-player/api";
import { ApiError, api } from "@/lib/api";
import {
  detailKey,
  historyKey,
  quizHref,
  resultHref,
  standaloneKey,
  useStandaloneDetail,
} from "./api";

/**
 * /quizzes/[slug]/attempt: resumes the running attempt only. Opening the URL
 * never starts one (that would spend an attempt); without a running attempt
 * it goes back to the landing page.
 */
export function StandaloneAttempt({ slug }: { slug: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const detail = useStandaloneDetail(slug);
  const quizId = detail.data?.id;
  const active = useQuery({
    queryKey: ["standalone-attempt", quizId],
    queryFn: ({ signal }) =>
      api<Attempt>(`/quizzes/${quizId}/active-attempt`, { signal }),
    enabled: Boolean(quizId),
    retry: false,
    // A resumed attempt must not refetch under the runner.
    staleTime: Infinity,
    gcTime: 0,
  });

  const missing =
    active.error instanceof ApiError &&
    active.error.code === "NO_ACTIVE_ATTEMPT";
  const closedAttempt =
    active.data && active.data.status !== "IN_PROGRESS" ? active.data : null;
  useEffect(() => {
    if (missing) router.replace(quizHref(slug));
    // Found past its deadline: it was just auto-submitted.
    else if (closedAttempt) router.replace(resultHref(slug, closedAttempt.id));
  }, [missing, closedAttempt, router, slug]);

  if (detail.error)
    return (
      <main className="container py-8">
        <Failure error={detail.error} />
      </main>
    );
  if (active.error && !missing)
    return (
      <main className="container py-8">
        <Failure error={active.error} retry={() => void active.refetch()} />
      </main>
    );
  if (!active.data || closedAttempt || missing)
    return <AttemptSkeleton />;

  return (
    <AttemptRunner
      title={detail.data?.title ?? ""}
      attempt={active.data}
      onClosed={(attemptId) => {
        void client.invalidateQueries({ queryKey: detailKey(slug) });
        void client.invalidateQueries({ queryKey: historyKey });
        void client.invalidateQueries({ queryKey: standaloneKey });
        router.push(resultHref(slug, attemptId));
      }}
    />
  );
}
