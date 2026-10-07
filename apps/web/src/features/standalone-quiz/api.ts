"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AttemptStatus } from "@/features/quiz-player/api";

export type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  BEGINNER: "Cơ bản",
  INTERMEDIATE: "Trung cấp",
  ADVANCED: "Nâng cao",
};
export const REVIEW_LABEL: Record<string, string> = {
  AFTER_SUBMIT: "Xem đáp án ngay sau khi nộp",
  ALWAYS: "Xem đáp án ngay sau khi nộp",
  AFTER_PASS: "Xem đáp án khi đạt",
  AFTER_EXHAUSTED: "Xem đáp án khi hết lượt",
  NEVER: "Không công bố đáp án",
};

// GET /quizzes/standalone
export type StandaloneSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  passingScore: number;
  durationMinutes: number | null;
  maxAttempts: number | null;
  totalQuestions: number;
  difficulty: Difficulty | null;
  tags: string[];
  totalAttempts: number;
  publishedAt: string | null;
};
export type StandaloneList = {
  quizzes: StandaloneSummary[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

// GET /quizzes/standalone/:slug
export type StandaloneDetail = StandaloneSummary & {
  totalPoints: number;
  reviewPolicy: string;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  hasActiveAttempt: boolean;
  isPassed: boolean;
  highestPercentage: number | null;
  latestResult: {
    attemptId: string;
    status: AttemptStatus;
    passed: boolean;
    percentage: number;
    submittedAt: string | null;
  } | null;
};

// GET /my-quiz-attempts
export type HistoryScope = "all" | "standalone" | "course";
export type MyAttempt = {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  quizSlug: string | null;
  scope: "LESSON" | "CHAPTER" | "COURSE" | "STANDALONE";
  courseId: string | null;
  courseSlug: string | null;
  courseTitle: string | null;
  attemptNumber: number;
  status: AttemptStatus;
  isExpired: boolean;
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string | null;
  durationSeconds: number | null;
  earnedPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
  isPassed: boolean | null;
};
export type MyAttemptPage = {
  attempts: MyAttempt[];
  pagination: StandaloneList["pagination"];
};

export type HubFilters = {
  page: number;
  search: string;
  difficulty: Difficulty | "";
  tag: string;
};

export const standaloneKey = ["standalone-quizzes"];
export const detailKey = (slug: string) => ["standalone-quiz", slug];
export const historyKey = ["my-quiz-attempts"];

export function useStandaloneList(filters: HubFilters) {
  const query = new URLSearchParams({
    page: String(filters.page),
    limit: "12",
  });
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.difficulty) query.set("difficulty", filters.difficulty);
  if (filters.tag) query.set("tag", filters.tag);
  return useQuery({
    queryKey: [...standaloneKey, filters],
    queryFn: ({ signal }) =>
      api<StandaloneList>(`/quizzes/standalone?${query}`, { signal }),
  });
}

export function useStandaloneDetail(slug: string) {
  return useQuery({
    queryKey: detailKey(slug),
    queryFn: ({ signal }) =>
      api<StandaloneDetail>(`/quizzes/standalone/${encodeURIComponent(slug)}`, {
        signal,
      }),
    retry: false,
  });
}

export function useMyAttempts(scope: HistoryScope, page: number) {
  return useQuery({
    queryKey: [...historyKey, scope, page],
    queryFn: ({ signal }) =>
      api<MyAttemptPage>(
        `/my-quiz-attempts?scope=${scope}&page=${page}&limit=20`,
        {
          signal,
        },
      ),
  });
}

export const quizHref = (slug: string) =>
  `/quizzes/${encodeURIComponent(slug)}`;
export const attemptHref = (slug: string) => `${quizHref(slug)}/attempt`;
export const resultHref = (slug: string, attemptId: string) =>
  `${quizHref(slug)}/results/${encodeURIComponent(attemptId)}`;
