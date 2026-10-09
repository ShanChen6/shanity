"use client";
import { useQuery } from "@tanstack/react-query";
import { api, apiNestedPage, ApiError } from "@/lib/api";
import {
  planQuestionSync,
  questionPayload,
  settingsPayload,
  type ApiQuestion,
  type ApiQuiz,
  type QuizDraft,
  type QuizScope,
  type QuizStatus,
} from "./model";

export type CourseOption = { id: string; title: string; status: string };
export type ChapterOption = { id: string; title: string; position: number };
export type LessonOption = {
  id: string;
  chapterId: string;
  title: string;
  position: number;
};
export type QuizListItem = {
  id: string;
  title: string;
  slug: string | null;
  scope: QuizScope;
  courseId: string | null;
  status: QuizStatus;
  version: number;
  isRequired: boolean;
  questionCount: number;
  updatedAt: string;
};
export type QuizPage = {
  quizzes: QuizListItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export const quizKey = (id: string) => ["instructor", "quiz", id];
export const quizzesKey = ["instructor", "quizzes"];

export function useInstructorCourses() {
  return useQuery({
    queryKey: ["instructor", "courses"],
    queryFn: ({ signal }) =>
      api<CourseOption[]>("/api/v1/instructor/courses", { signal }),
  });
}
export function useCourseChapters(courseId: string) {
  return useQuery({
    queryKey: ["instructor", "chapters", courseId],
    queryFn: ({ signal }) =>
      api<ChapterOption[]>(`/api/v1/instructor/courses/${courseId}/chapters`, {
        signal,
      }),
    enabled: Boolean(courseId),
  });
}
export function useCourseLessons(courseId: string) {
  return useQuery({
    queryKey: ["instructor", "lessons", courseId],
    queryFn: ({ signal }) =>
      api<LessonOption[]>(`/api/v1/instructor/courses/${courseId}/lessons`, {
        signal,
      }),
    enabled: Boolean(courseId),
  });
}
export function useQuiz(id: string) {
  return useQuery({
    queryKey: quizKey(id),
    queryFn: ({ signal }) =>
      api<ApiQuiz>(`/api/v1/instructor/quizzes/${id}`, { signal }),
  });
}
export function useQuizList(params: {
  page: number;
  search: string;
  status: string;
  /** Only quizzes attached to this course (its lessons, chapters, itself). */
  courseId?: string;
}) {
  const query = new URLSearchParams({ page: String(params.page), limit: "20" });
  if (params.courseId) query.set("courseId", params.courseId);
  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);
  return useQuery({
    queryKey: [...quizzesKey, params],
    queryFn: ({ signal }) =>
      apiNestedPage<"quizzes", QuizListItem>(
        "quizzes",
        `/api/v1/instructor/quizzes?${query}`,
        { signal },
      ),
  });
}

/** Where a saved LESSON/CHAPTER quiz sits, to prefill the cascade selects. */
export async function resolveTargetPath(quiz: ApiQuiz) {
  const courseId = quiz.courseId ?? "";
  if (quiz.scope === "CHAPTER")
    return { courseId, chapterId: quiz.targetId ?? "", lessonId: "" };
  if (quiz.scope === "LESSON" && courseId) {
    const lessons = await api<LessonOption[]>(
      `/api/v1/instructor/courses/${courseId}/lessons`,
    );
    const lesson = lessons.find(({ id }) => id === quiz.targetId);
    return {
      courseId,
      chapterId: lesson?.chapterId ?? "",
      lessonId: quiz.targetId ?? "",
    };
  }
  return { courseId, chapterId: "", lessonId: "" };
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

/**
 * Save Draft: settings first (creating the quiz when new), then questions by
 * the sync plan, then the final order. Returns the fresh authoring view.
 * Only DRAFT quizzes accept these writes; the server rejects anything else.
 */
export async function saveQuiz(
  draft: QuizDraft,
  existing: ApiQuiz | null,
): Promise<ApiQuiz> {
  const isNew = !existing;
  const quiz = existing
    ? await api<ApiQuiz>(
        `/api/v1/instructor/quizzes/${existing.id}`,
        json("PUT", settingsPayload(draft, false)),
      )
    : await api<ApiQuiz>(
        "/api/v1/instructor/quizzes",
        json("POST", settingsPayload(draft, true)),
      );

  const plan = planQuestionSync(
    draft.questions,
    isNew ? [] : existing.questions,
  );
  for (const id of plan.remove)
    await api(
      `/api/v1/instructor/quizzes/${quiz.id}/questions/${id}`,
      json("DELETE"),
    );
  const created = new Map<string, string>();
  for (const question of plan.create) {
    const saved = await api<ApiQuestion>(
      `/api/v1/instructor/quizzes/${quiz.id}/questions`,
      json("POST", questionPayload(question)),
    );
    created.set(question.key, saved.id);
  }
  const order = draft.questions
    .map((question) => plan.keep.get(question.key) ?? created.get(question.key))
    .filter((id): id is string => Boolean(id));
  if (order.length > 1)
    await api(
      `/api/v1/instructor/quizzes/${quiz.id}/questions/reorder`,
      json("PATCH", {
        items: order.map((id, index) => ({ id, position: index + 1 })),
      }),
    );
  return api<ApiQuiz>(`/api/v1/instructor/quizzes/${quiz.id}`);
}

export const publishQuiz = (id: string) =>
  api<{ id: string; version: number; status: QuizStatus }>(
    `/api/v1/instructor/quizzes/${id}/publish`,
    json("POST"),
  );

export const openNewVersion = (id: string) =>
  api<{ id: string; version: number; status: QuizStatus }>(
    `/api/v1/instructor/quizzes/${id}/versions`,
    json("POST"),
  );

/** Server publish gate issues, when the error is one. */
export function publishGateIssues(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const issues = error.data.issues;
  return Array.isArray(issues)
    ? issues
        .map((issue) => (issue as { code?: unknown }).code)
        .filter((code): code is string => typeof code === "string")
    : null;
}
