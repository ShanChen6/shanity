"use client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/features/auth/session-provider";
import { TextLessonViewer } from "@/features/lessons/text-lesson-viewer";
import { Failure } from "@/features/instructor/shared";
import { ApiError, api } from "@/lib/api";
import { useLearning } from "./learning-context";
import { flattenLessons } from "./learning-model";
import { LearningNotFound } from "./states/LearningNotFound";
import { LessonLockedState } from "./states/LessonLockedState";
import { LessonSkeleton } from "./states/LessonSkeleton";

type LessonPayload = {
  id: string;
  title: string;
  type: "TEXT" | "VIDEO" | "DOCUMENT";
  content?: string | null;
  videoExternalUrl?: string | null;
  fileName?: string | null;
};

const TYPE_LABEL = { TEXT: "Text", VIDEO: "Video", DOCUMENT: "Document" } as const;

// Detailed players (video/PDF) are out of scope here; this is the renderer container.
export function LessonContentViewer({ lessonSlug }: { lessonSlug: string }) {
  const { syllabus, courseSlug, isAuthenticated, isStudent } = useLearning();
  const { user } = useSession();
  const target = flattenLessons(syllabus.curriculum).find(
    (lesson) => lesson.slug === lessonSlug,
  );
  const query = useQuery({
    queryKey: ["learn", "lesson", target?.id, user?.id ?? "guest"],
    queryFn: ({ signal }) =>
      api<LessonPayload>(`/lessons/${target!.id}`, { signal }, isAuthenticated),
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
    return (
      <div className="p-6">
        <Failure error={query.error} retry={() => void query.refetch()} />
      </div>
    );
  }

  const lesson = query.data;
  return (
    <article className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <Badge tone="info">{TYPE_LABEL[lesson.type]}</Badge>
        <h2 className="text-2xl font-semibold">{lesson.title}</h2>
      </header>
      <div data-testid="lesson-renderer">
        {lesson.type === "TEXT" && <TextLessonViewer content={lesson.content ?? ""} />}
        {lesson.type === "VIDEO" && (
          <p className="rounded-md border border-border p-6 text-sm text-muted">
            Trình phát video sẽ hiển thị tại đây.
          </p>
        )}
        {lesson.type === "DOCUMENT" && (
          <p className="rounded-md border border-border p-6 text-sm text-muted">
            Trình xem tài liệu{lesson.fileName ? ` “${lesson.fileName}”` : ""} sẽ hiển thị tại đây.
          </p>
        )}
      </div>
    </article>
  );
}
