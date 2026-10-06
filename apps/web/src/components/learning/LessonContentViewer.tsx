"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/session-provider";
import { Failure } from "@/features/instructor/shared";
import { ApiError, api } from "@/lib/api";
import { progressKey, useLearning } from "./learning-context";
import { flattenLessons } from "./learning-model";
import { LessonContentRenderer } from "./renderers/LessonContentRenderer";
import type { LessonData } from "./renderers/types";
import { AccessDeniedCard } from "./states/AccessDeniedCard";
import { NotFoundCard } from "./states/NotFoundCard";
import { SessionExpiredState } from "./states/SessionExpiredState";
import { LessonSkeleton } from "./states/LessonSkeleton";

const TYPE_LABEL = {
  TEXT: "Text",
  VIDEO: "Video",
  DOCUMENT: "Document",
} as const;

export function LessonContentViewer({ lessonSlug }: { lessonSlug: string }) {
  const { syllabus, courseSlug, isAuthenticated, isStudent } = useLearning();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const target = flattenLessons(syllabus.curriculum).find(
    (lesson) => lesson.slug === lessonSlug,
  );
  const query = useQuery({
    queryKey: ["learn", "lesson", target?.id, user?.id ?? "guest"],
    queryFn: ({ signal }) =>
      api<LessonData>(`/lessons/${target!.id}`, { signal }, isAuthenticated),
    enabled: Boolean(target),
    retry: false,
  });
  const refreshProgress = () =>
    queryClient.invalidateQueries({
      queryKey: progressKey(syllabus.course.id, user?.id),
    });
  const start = useMutation({
    mutationFn: () =>
      api(`/lessons/${target!.id}/progress/start`, { method: "POST" }),
  });
  const complete = useMutation({
    mutationFn: (evidence: object = {}) =>
      api(`/lessons/${target!.id}/progress/complete`, {
        method: "POST",
        body: JSON.stringify(evidence),
      }),
    onSuccess: refreshProgress,
  });
  const videoProgress = useMutation({
    mutationFn: (progress: {
      seconds: number;
      percentage: number;
      ended?: boolean;
    }) =>
      api(`/lessons/${target!.id}/video-progress`, {
        method: "PATCH",
        body: JSON.stringify(progress),
      }),
    onSuccess: refreshProgress,
  });
  useEffect(() => {
    if (target && isStudent) start.mutate();
    // A lesson open is the sole NOT_STARTED -> IN_PROGRESS transition trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, isStudent]);

  if (!target) return <NotFoundCard scope="lesson" />;
  if (query.isPending) return <LessonSkeleton />;
  if (query.error) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 401)
      return (
        <SessionExpiredState courseSlug={courseSlug} lessonSlug={lessonSlug} />
      );
    if (status === 403) return <AccessDeniedCard courseSlug={courseSlug} />;
    if (status === 404) return <NotFoundCard scope="lesson" />;
    return (
      <div className="p-6">
        <Failure error={query.error} retry={() => void query.refetch()} />
      </div>
    );
  }

  const lesson = query.data;
  const privileged = Boolean(
    user &&
    (user.roles.includes("admin") || user.id === syllabus.instructor?.id),
  );
  return (
    <article className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <Badge tone="info">{TYPE_LABEL[lesson.type]}</Badge>
        <h2 className="text-2xl font-semibold">{lesson.title}</h2>
      </header>
      <div data-testid="lesson-renderer">
        <LessonContentRenderer
          lesson={lesson}
          userAccess={{
            canView: true,
            canDownload: privileged || lesson.allowDownload === true,
          }}
          onComplete={
            lesson.type === "VIDEO"
              ? undefined
              : (evidence) => complete.mutate(evidence ?? {})
          }
          onVideoProgress={(progress) => videoProgress.mutate(progress)}
        />
      </div>
    </article>
  );
}
