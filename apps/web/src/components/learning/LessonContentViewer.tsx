"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/session-provider";
import { Failure } from "@/features/instructor/shared";
import { ApiError, api } from "@/lib/api";
import { useLearning } from "./learning-context";
import { flattenLessons } from "./learning-model";
import { LessonContentRenderer } from "./renderers/LessonContentRenderer";
import type { LessonData } from "./renderers/types";
import { LearningNotFound } from "./states/LearningNotFound";
import { LessonLockedState } from "./states/LessonLockedState";
import { LessonSkeleton } from "./states/LessonSkeleton";

const TYPE_LABEL = { TEXT: "Text", VIDEO: "Video", DOCUMENT: "Document" } as const;

export function LessonContentViewer({ lessonSlug }: { lessonSlug: string }) {
  const { syllabus, courseSlug, isAuthenticated, isStudent } = useLearning();
  const { user } = useSession();
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

  if (!target) return <LearningNotFound scope="lesson" courseSlug={courseSlug} />;
  if (query.isPending) return <LessonSkeleton />;
  if (query.error) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 401 || status === 403)
      return (
        <LessonLockedState
          courseId={syllabus.course.id}
          courseSlug={courseSlug}
          lessonSlug={lessonSlug}
          isAuthenticated={isAuthenticated}
          isStudent={isStudent}
        />
      );
    if (status === 404)
      return <LearningNotFound scope="lesson" courseSlug={courseSlug} />;
    return <div className="p-6"><Failure error={query.error} retry={() => void query.refetch()} /></div>;
  }

  const lesson = query.data;
  const privileged = Boolean(
    user && (user.roles.includes("admin") || user.id === syllabus.instructor?.id),
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
        />
      </div>
    </article>
  );
}
