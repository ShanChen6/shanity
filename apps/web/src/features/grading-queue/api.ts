"use client";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  queueQuery,
  type GradeResult,
  type GradingAttempt,
  type GradingQueuePage,
  type GradesPayload,
  type QueueFilters,
} from "./model";

export const gradingQueueKey = (filters: QueueFilters) => [
  "instructor",
  "grading-queue",
  filters,
];

/** A 403 here means the course filter is not one the caller teaches. */
export function useGradingQueue(filters: QueueFilters) {
  return useQuery({
    queryKey: gradingQueueKey(filters),
    queryFn: ({ signal }) =>
      api<GradingQueuePage>(`/instructor/grading-queue?${queueQuery(filters)}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export type CourseOption = { id: string; title: string; slug: string | null };

/** Only the courses the caller may grade (owned, taught or assigned). */
export function useGradingCourses() {
  return useQuery({
    queryKey: ["instructor", "grading-courses"],
    queryFn: ({ signal }) =>
      api<CourseOption[]>("/instructor/grading-queue/courses", { signal }),
  });
}

export type QuizOption = { id: string; title: string };

/** The quizzes of one course, for the quiz filter. */
export function useCourseQuizOptions(courseId: string) {
  return useQuery({
    queryKey: ["instructor", "grading-quizzes", courseId],
    queryFn: ({ signal }) =>
      api<{ quizzes: QuizOption[] }>(
        `/admin/quizzes?courseId=${courseId}&limit=100`,
        { signal },
      ).then(({ quizzes }) => quizzes),
    enabled: Boolean(courseId),
  });
}

export const gradingAttemptKey = (attemptId: string) => [
  "instructor",
  "grading-attempt",
  attemptId,
];

export function useGradingAttempt(attemptId: string) {
  return useQuery({
    queryKey: gradingAttemptKey(attemptId),
    queryFn: ({ signal }) =>
      api<GradingAttempt>(`/instructor/quiz-attempts/${attemptId}`, {
        signal,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export type PublishResult = {
  attemptId: string;
  status: "COMPLETED";
  publishedAt: string;
  alreadyPublished: boolean;
};
export type PublishAllResult = {
  quizId: string;
  publishedCount: number;
  attemptIds: string[];
  stillNeedGradingCount: number;
};

function useRefreshQueue() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["instructor", "grading-queue"] }),
      client.invalidateQueries({ queryKey: ["instructor", "grading-attempt"] }),
    ]);
}

/** Makes one graded attempt's result visible to its learner. */
export function usePublishAttempt() {
  const refresh = useRefreshQueue();
  return useMutation({
    mutationFn: (attemptId: string) =>
      api<PublishResult>(`/instructor/quiz-attempts/${attemptId}/publish`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
}

/** Publishes every graded attempt of a quiz. */
export function usePublishQuizResults() {
  const refresh = useRefreshQueue();
  return useMutation({
    mutationFn: (quizId: string) =>
      api<PublishAllResult>(`/instructor/quizzes/${quizId}/publish-results`, {
        method: "POST",
      }),
    onSuccess: refresh,
  });
}

/** Saves the filled-in grades; the server finalizes the attempt itself. */
export function useSaveGrades(attemptId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (grades: GradesPayload) =>
      api<GradeResult>(`/instructor/quiz-attempts/${attemptId}/grade`, {
        method: "POST",
        body: JSON.stringify({ grades }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: gradingAttemptKey(attemptId),
      });
      await client.invalidateQueries({
        queryKey: ["instructor", "grading-queue"],
      });
    },
  });
}
