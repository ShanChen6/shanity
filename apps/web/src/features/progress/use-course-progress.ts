"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

export type CourseProgressResponse = CourseProgressSummary & {
  lessons: Array<{ lessonId: string; status: string }>;
};

export const progressKey = (courseId: string, userId?: string) => [
  "learn",
  "progress",
  courseId,
  userId,
];

export function useCourseProgress(
  courseId: string,
  userId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: progressKey(courseId, userId),
    queryFn: ({ signal }) =>
      api<CourseProgressResponse>(`/courses/${courseId}/progress`, { signal }),
    enabled,
    retry: false,
  });
}
