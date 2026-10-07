"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/session-provider";
import { Failure } from "@/features/instructor/shared";
import { ApiError, api, errorMessage } from "@/lib/api";
import {
  useCompleteLesson,
  useLessonHeartbeat,
  useStartLesson,
  useVideoProgress,
  type CompletionEvidence,
  type VideoProgress,
} from "@/features/progress/use-course-progress";
import { useCurriculumNavigation } from "@/hooks/useCurriculumNavigation";
import { CourseCompletedDialog } from "./CourseCompletedDialog";
import { useLearning } from "./learning-context";
import {
  learningPath,
  quizPath,
  type PrerequisiteLesson,
} from "./learning-model";
import { LessonQuizCallout } from "./quiz/LessonQuizCallout";
import { LessonActionBar, type LessonCompletionState } from "./LessonActionBar";
import { LessonContentRenderer } from "./renderers/LessonContentRenderer";
import type { LessonData } from "./renderers/types";
import { AccessDeniedCard } from "./states/AccessDeniedCard";
import { PrerequisiteLockedState } from "./states/PrerequisiteLockedState";
import { EnrollmentSuspendedState } from "./states/EnrollmentSuspendedState";
import { NotFoundCard } from "./states/NotFoundCard";
import { SessionExpiredState } from "./states/SessionExpiredState";
import { LessonSkeleton } from "./states/LessonSkeleton";

const TYPE_LABEL = {
  TEXT: "Text",
  VIDEO: "Video",
  DOCUMENT: "Document",
} as const;

const HINT = {
  TEXT: "Đọc ít nhất 80% nội dung để hoàn thành bài học.",
  VIDEO: "Xem ít nhất 85% video, bài học sẽ tự động hoàn thành.",
  DOCUMENT: "Đợi tài liệu tải xong để hoàn thành bài học.",
} as const;

const HEARTBEAT_MS = 30_000;

function parsePrerequisite(value: unknown): PrerequisiteLesson | null {
  if (!value || typeof value !== "object") return null;
  const { id, title, slug, quizId } = value as Record<string, unknown>;
  return typeof id === "string" &&
    typeof title === "string" &&
    typeof slug === "string"
    ? { id, title, slug, quizId: typeof quizId === "string" ? quizId : null }
    : null;
}

function completionError(error: unknown) {
  if (error instanceof ApiError && error.status === 400)
    return "Bạn chưa đủ điều kiện hoàn thành bài học này. Hãy xem hết nội dung rồi thử lại.";
  return `Không thể lưu tiến độ. ${errorMessage(error)}`;
}

export function LessonContentViewer({ lessonSlug }: { lessonSlug: string }) {
  const {
    syllabus,
    courseSlug,
    curriculum,
    courseProgress,
    isAuthenticated,
    isLocked,
    isTracking,
    prerequisiteOf,
    statusOf,
    quizzesOf,
    isQuizLocked,
  } = useLearning();
  const { user } = useSession();
  const router = useRouter();
  const courseId = syllabus.course.id;
  const { currentLesson: target, nextLesson } = useCurriculumNavigation(
    courseSlug,
    curriculum,
    lessonSlug,
  );
  const query = useQuery({
    queryKey: ["learn", "lesson", target?.id, user?.id ?? "guest"],
    queryFn: ({ signal }) =>
      api<LessonData>(`/lessons/${target!.id}`, { signal }, isAuthenticated),
    enabled: Boolean(target),
    retry: false,
  });
  const start = useStartLesson(courseId, user?.id);
  const heartbeat = useLessonHeartbeat(courseId, user?.id);
  const complete = useCompleteLesson(courseId, user?.id);
  const video = useVideoProgress(courseId, user?.id);
  const [toast, setToast] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  // Keyed by lesson so evidence never leaks into the next lesson.
  const [evidence, setEvidence] = useState<{
    lessonId: string;
    value: CompletionEvidence;
  } | null>(null);

  const lessonId = target?.id;
  const lessonType = query.data?.type;
  const status = target ? statusOf(target) : "NOT_STARTED";

  // Opening a lesson is the sole NOT_STARTED -> IN_PROGRESS trigger and moves
  // the server-side resume pointer used by /my-learning on every device.
  const served = query.isSuccess;
  useEffect(() => {
    if (lessonId && isTracking && served) start.mutate(lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, isTracking, served]);

  // Videos already sync every 10s; other lesson types keep lastAccessedAt
  // fresh while the tab is visible and once more when it is hidden.
  const sendHeartbeat = heartbeat.mutate;
  useEffect(() => {
    if (!lessonId || !isTracking || !lessonType || lessonType === "VIDEO")
      return;
    const beat = () => sendHeartbeat({ lessonId, lastPosition: 0 });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") beat();
    }, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") beat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lessonId, isTracking, lessonType, sendHeartbeat]);

  const onEvidence = useCallback(
    (value: CompletionEvidence) => {
      if (lessonId)
        setEvidence((current) => ({
          lessonId,
          value: {
            ...(current?.lessonId === lessonId ? current.value : {}),
            ...value,
          },
        }));
    },
    [lessonId],
  );
  const sendVideo = video.mutate;
  const percentage = courseProgress.percentage;
  const onVideoProgress = useCallback(
    (progress: VideoProgress) => {
      if (!lessonId || !isTracking) return;
      // Videos complete without a click, so celebrate from the server's answer.
      sendVideo(
        { lessonId, progress },
        {
          onSuccess: (result) => {
            if (result.courseProgress.percentage >= 100 && percentage < 100)
              setCelebrate(true);
          },
        },
      );
    },
    [lessonId, isTracking, sendVideo, percentage],
  );
  const closeToast = useCallback(() => setToast(null), []);

  // Returns true when the action bar should continue to the next lesson.
  async function completeLesson() {
    if (!target) return false;
    const before = courseProgress.percentage;
    try {
      const result = await complete.mutateAsync({
        lessonId: target.id,
        evidence: evidence?.lessonId === target.id ? evidence.value : {},
      });
      if (result.courseProgress.percentage >= 100 && before < 100) {
        setCelebrate(true);
        return false;
      }
      // Learn -> quiz -> next: a required quiz not yet passed comes first.
      const pendingQuiz = quizzesOf("LESSON", target.id).find(
        (quiz) => quiz.isRequired && !quiz.isPassed,
      );
      if (pendingQuiz) {
        router.push(quizPath(courseSlug, pendingQuiz.id));
        return false;
      }
      return true;
    } catch (error) {
      setToast(completionError(error));
      return false;
    }
  }

  if (!target) return <NotFoundCard scope="lesson" />;

  const lessonEvidence =
    evidence?.lessonId === target.id ? evidence.value : null;
  const completion: LessonCompletionState =
    !isTracking || !query.isSuccess
      ? { kind: "untracked" }
      : status === "COMPLETED"
        ? { kind: "completed" }
        : {
            kind: "incomplete",
            hint: lessonEvidence ? undefined : HINT[query.data.type],
          };

  let body: ReactNode;
  if (query.isPending) body = <LessonSkeleton />;
  else if (query.error) {
    const code = query.error instanceof ApiError ? query.error.status : 0;
    // The server names the lesson to finish first; fall back to the client's
    // own computation if the payload is missing.
    const requiredLesson =
      query.error instanceof ApiError &&
      query.error.code === "PREREQUISITE_LESSON_NOT_COMPLETED"
        ? (parsePrerequisite(query.error.data.requiredLesson) ??
          prerequisiteOf(target))
        : null;
    body =
      code === 401 ? (
        <SessionExpiredState courseSlug={courseSlug} lessonSlug={lessonSlug} />
      ) : code === 403 &&
        query.error instanceof ApiError &&
        query.error.code === "ENROLLMENT_SUSPENDED" ? (
        <EnrollmentSuspendedState />
      ) : code === 403 && requiredLesson ? (
        <PrerequisiteLockedState
          courseSlug={courseSlug}
          requiredLesson={requiredLesson}
        />
      ) : code === 403 ? (
        <AccessDeniedCard courseSlug={courseSlug} />
      ) : code === 404 ? (
        <NotFoundCard scope="lesson" />
      ) : (
        <div className="p-6">
          <Failure error={query.error} retry={() => void query.refetch()} />
        </div>
      );
  } else {
    const lesson = query.data;
    const privileged = Boolean(
      user &&
      (user.roles.includes("admin") || user.id === syllabus.instructor?.id),
    );
    body = (
      <article className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="space-y-2">
          <Badge tone="info">{TYPE_LABEL[lesson.type]}</Badge>
          <h2 className="text-2xl font-semibold">{lesson.title}</h2>
        </header>
        <div data-testid="lesson-renderer">
          <LessonContentRenderer
            lesson={lesson}
            initialPosition={start.data?.progress.lastPosition ?? 0}
            userAccess={{
              canView: true,
              canDownload: privileged || lesson.allowDownload === true,
            }}
            onEvidence={onEvidence}
            onVideoProgress={onVideoProgress}
          />
        </div>
        {quizzesOf("LESSON", target.id).map((quiz) => (
          <LessonQuizCallout
            key={quiz.id}
            courseSlug={courseSlug}
            quiz={quiz}
            locked={isQuizLocked(quiz)}
          />
        ))}
      </article>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">{body}</div>
      <LessonActionBar
        courseSlug={courseSlug}
        curriculum={curriculum}
        activeSlug={lessonSlug}
        isLocked={isLocked}
        completion={completion}
        onComplete={completeLesson}
      />
      {toast ? (
        <Toast tone="error" message={toast} onClose={closeToast} />
      ) : null}
      {celebrate ? (
        <CourseCompletedDialog
          courseTitle={syllabus.course.title}
          onClose={() => setCelebrate(false)}
          onContinue={
            nextLesson && !isLocked(nextLesson)
              ? () => {
                  setCelebrate(false);
                  router.push(learningPath(courseSlug, nextLesson.slug));
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
