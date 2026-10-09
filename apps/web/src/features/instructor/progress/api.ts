"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Mirrors GET /instructor/courses/:courseId/students-progress.
export const STUDENT_STATUSES = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "IN_PROGRESS", label: "Đang học" },
  { value: "NOT_STARTED", label: "Chưa bắt đầu" },
] as const;
export const STUDENT_SORTS = [
  { value: "last_accessed_desc", label: "Hoạt động gần nhất" },
  { value: "percentage_desc", label: "Tiến độ cao nhất" },
  { value: "percentage_asc", label: "Tiến độ thấp nhất" },
] as const;
export type StudentStatusFilter = (typeof STUDENT_STATUSES)[number]["value"];
export type StudentProgressStatus = Exclude<StudentStatusFilter, "ALL">;
export type StudentSort = (typeof STUDENT_SORTS)[number]["value"];

export type StudentProgressRow = {
  studentId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  enrolledAt: string;
  lastAccessedAt: string | null;
  status: StudentProgressStatus;
  progress: {
    percentage: number;
    completedLessons: number;
    totalLessons: number;
    completedRequiredLessons: number;
    totalRequiredLessons: number;
  };
};

export type StudentsProgressResponse = {
  course: {
    id: string;
    title: string;
    totalStudents: number;
    avgProgressPercentage: number;
    completedStudents: number;
    completionRate: number;
  };
  students: StudentProgressRow[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type StudentLessonsResponse = {
  studentId: string;
  fullName: string;
  email: string;
  lessons: Array<{
    lessonId: string;
    title: string;
    chapterTitle: string;
    isRequired: boolean;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    completedAt: string | null;
  }>;
};

export type StudentsProgressQuery = {
  page: number;
  limit: number;
  search: string;
  status: StudentStatusFilter;
  sortBy: StudentSort;
};

// URL values are untrusted; anything unknown falls back to the default.
export function parseProgressQuery(
  params: URLSearchParams,
): StudentsProgressQuery {
  const page = Number(params.get("page"));
  const pick = <T extends string>(
    values: ReadonlyArray<{ value: T }>,
    value: string | null,
    fallback: T,
  ) => values.find((item) => item.value === value)?.value ?? fallback;
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: 20,
    search: (params.get("search") ?? "").slice(0, 100),
    status: pick(STUDENT_STATUSES, params.get("status"), "ALL"),
    sortBy: pick(STUDENT_SORTS, params.get("sortBy"), "last_accessed_desc"),
  };
}

export function progressSearch(query: StudentsProgressQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
    sortBy: query.sortBy,
    status: query.status,
  });
  if (query.search.trim()) params.set("search", query.search.trim());
  return params.toString();
}

export function useStudentsProgress(
  courseId: string,
  query: StudentsProgressQuery,
) {
  return useQuery({
    queryKey: ["instructor", "students-progress", courseId, query],
    queryFn: ({ signal }) =>
      api<StudentsProgressResponse>(
        `/api/v1/instructor/courses/${courseId}/students-progress?${progressSearch(query)}`,
        { signal },
      ),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useStudentLessons(courseId: string, studentId: string | null) {
  return useQuery({
    queryKey: ["instructor", "student-lessons", courseId, studentId],
    queryFn: ({ signal }) =>
      api<StudentLessonsResponse>(
        `/api/v1/instructor/courses/${courseId}/students/${studentId}/progress`,
        { signal },
      ),
    enabled: Boolean(studentId),
  });
}

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const formatDate = (value: string) => dateFormat.format(new Date(value));

const relative = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];
// "2 giờ trước", "hôm qua"…; null means the student never opened a lesson.
export function relativeTime(value: string | null, now = Date.now()) {
  if (!value) return "Chưa truy cập";
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  return "Vừa xong";
}
