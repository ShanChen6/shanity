"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { broadcastProgressChanged } from "./progress-sync";

export type CourseProgressSummary = {
  courseId: string;
  userId: string;
  totalLessons: number;
  totalRequiredLessons: number;
  completedLessons: number;
  completedRequiredLessons: number;
  percentage: number;
  isCompleted: boolean;
  lastAccessedLessonId?: string;
  updatedAt: string;
};

export type ServerLessonStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

// Rows from GET /courses/:courseId/progress (published lessons only).
export type LessonProgressItem = {
  lessonId: string;
  status: ServerLessonStatus;
  isRequired: boolean;
  lastPosition: number;
};

export type CourseProgressResponse = CourseProgressSummary & {
  lessons: LessonProgressItem[];
};

// Every progress mutation answers with the saved row and the recalculated course.
export type LessonProgressResult = {
  progress: {
    lessonId: string;
    status: Exclude<ServerLessonStatus, "NOT_STARTED">;
    lastPosition: number | null;
  };
  courseProgress: CourseProgressSummary;
};

export type CompletionEvidence = {
  scrollPercentage?: number;
  reachedLastPage?: boolean;
  downloaded?: boolean;
};

export const courseProgressKey = (courseId: string, userId?: string) => [
  "course-progress",
  courseId,
  userId,
];

const RANK: Record<ServerLessonStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

// Mirror of the server formula (CourseProgressCalculatorService): required,
// published lessons only, floored, capped. Floor means 100% only when every
// required lesson is done (199/200 is 99%, not "completed").
export const progressPercentage = (completed: number, total: number) =>
  total > 0 ? Math.min(100, Math.floor((completed * 100) / total)) : 100;

// Optimistic recompute. Statuses only move forward so a late "start" never
// undoes a completion.
export function withLessonStatus(
  data: CourseProgressResponse,
  lessonId: string,
  status: ServerLessonStatus,
): CourseProgressResponse {
  const lessons = data.lessons.map((lesson) =>
    lesson.lessonId === lessonId && RANK[status] > RANK[lesson.status]
      ? { ...lesson, status }
      : lesson,
  );
  const completed = lessons.filter((lesson) => lesson.status === "COMPLETED");
  const completedRequiredLessons = completed.filter(
    (lesson) => lesson.isRequired,
  ).length;
  const percentage = progressPercentage(
    completedRequiredLessons,
    data.totalRequiredLessons,
  );
  return {
    ...data,
    lessons,
    completedLessons: completed.length,
    completedRequiredLessons,
    percentage,
    isCompleted: percentage === 100,
  };
}

// The server's recalculated summary wins over any optimistic numbers.
export function mergeProgressResult(
  data: CourseProgressResponse,
  result: LessonProgressResult,
): CourseProgressResponse {
  return {
    ...withLessonStatus(data, result.progress.lessonId, result.progress.status),
    ...result.courseProgress,
  };
}

export function useCourseProgress(
  courseId: string,
  userId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: courseProgressKey(courseId, userId),
    queryFn: ({ signal }) =>
      api<CourseProgressResponse>(`/courses/${courseId}/progress`, { signal }),
    enabled,
    retry: false,
  });
}

// Summaries of this course cached by other pages (dashboard, resume card).
function invalidateSummaries(client: QueryClient) {
  void client.invalidateQueries({ queryKey: ["student", "enrolled-courses"] });
  void client.invalidateQueries({ queryKey: ["student", "resume-course"] });
}

// Everything derived from a course's progress, in this tab. Used after local
// mutations and when another tab reports one (see progress-sync.tsx).
export function refreshCourseProgress(client: QueryClient, courseId: string) {
  void client.invalidateQueries({ queryKey: ["course-progress", courseId] });
  invalidateSummaries(client);
  // A completion can unlock later lessons in sequential courses: drop cached
  // "locked" (403) lesson reads so they refetch cleanly.
  client.removeQueries({
    queryKey: ["learn", "lesson"],
    predicate: (query) => query.state.status === "error",
  });
}

function useProgressCache(courseId: string, userId?: string) {
  const client = useQueryClient();
  const key = courseProgressKey(courseId, userId);
  return {
    client,
    key,
    merge: (result: LessonProgressResult) =>
      client.setQueryData<CourseProgressResponse>(key, (data) =>
        data ? mergeProgressResult(data, result) : data,
      ),
    // Cancel in-flight reads so they can't overwrite the optimistic state.
    async optimistic(lessonId: string) {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<CourseProgressResponse>(key);
      if (previous)
        client.setQueryData(
          key,
          withLessonStatus(previous, lessonId, "COMPLETED"),
        );
      return { previous };
    },
    rollback(context?: { previous?: CourseProgressResponse }) {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    settle() {
      refreshCourseProgress(client, courseId);
      broadcastProgressChanged(courseId);
    },
  };
}

export function useCompleteLesson(courseId: string, userId?: string) {
  const cache = useProgressCache(courseId, userId);
  return useMutation({
    mutationFn: ({
      lessonId,
      evidence,
    }: {
      lessonId: string;
      evidence: CompletionEvidence;
    }) =>
      api<LessonProgressResult>(`/lessons/${lessonId}/progress/complete`, {
        method: "POST",
        body: JSON.stringify(evidence),
      }),
    onMutate: ({ lessonId }) => cache.optimistic(lessonId),
    onError: (_error, _variables, context) => cache.rollback(context),
    onSuccess: cache.merge,
    onSettled: cache.settle,
  });
}

export type VideoProgress = {
  seconds: number;
  percentage: number;
  ended?: boolean;
};
// The server completes a video at >= 85% watched or when it ends.
export const completesVideo = (progress: VideoProgress) =>
  Boolean(progress.ended) || progress.percentage >= 85;

export function useVideoProgress(courseId: string, userId?: string) {
  const cache = useProgressCache(courseId, userId);
  return useMutation({
    mutationFn: ({
      lessonId,
      progress,
    }: {
      lessonId: string;
      progress: VideoProgress;
    }) =>
      api<LessonProgressResult>(`/lessons/${lessonId}/video-progress`, {
        method: "PATCH",
        body: JSON.stringify(progress),
      }),
    onMutate: async ({ lessonId, progress }) =>
      completesVideo(progress) ? cache.optimistic(lessonId) : {},
    onError: (_error, _variables, context) => cache.rollback(context),
    onSuccess: cache.merge,
    // Periodic position syncs are frequent; only a completion needs a refetch.
    onSettled: (_data, _error, { progress }) => {
      if (completesVideo(progress)) cache.settle();
    },
  });
}

// Opening a lesson marks it IN_PROGRESS and moves the cross-device resume pointer.
export function useStartLesson(courseId: string, userId?: string) {
  const cache = useProgressCache(courseId, userId);
  return useMutation({
    mutationFn: (lessonId: string) =>
      api<LessonProgressResult>(`/lessons/${lessonId}/progress/start`, {
        method: "POST",
      }),
    onSuccess: (result) => {
      cache.merge(result);
      invalidateSummaries(cache.client);
      // Other tabs' "recently accessed" ordering and resume pointer moved.
      broadcastProgressChanged(courseId);
    },
  });
}

// Keeps lastAccessedAt fresh while a non-video lesson stays open.
export function useLessonHeartbeat(courseId: string, userId?: string) {
  const cache = useProgressCache(courseId, userId);
  return useMutation({
    mutationFn: ({
      lessonId,
      lastPosition,
    }: {
      lessonId: string;
      lastPosition: number;
    }) =>
      api<LessonProgressResult>(`/lessons/${lessonId}/progress/heartbeat`, {
        method: "PATCH",
        body: JSON.stringify({ lastPosition }),
      }),
    onSuccess: cache.merge,
  });
}
