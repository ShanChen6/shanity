"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-provider";
import {
  type CourseProgressSummary,
  useCourseProgress,
} from "@/features/progress/use-course-progress";
import { api } from "@/lib/api";
import {
  type Syllabus,
  type SyllabusChapter,
  type SyllabusLesson,
} from "./learning-model";

type LearningContextValue = {
  courseSlug: string;
  syllabus: Syllabus;
  curriculum: SyllabusChapter[];
  completed: ReadonlySet<string>;
  courseProgress: CourseProgressSummary;
  isLocked: (lesson: SyllabusLesson) => boolean;
  isStudent: boolean;
  isAuthenticated: boolean;
};

const Context = createContext<LearningContextValue | null>(null);

export const syllabusKey = (courseSlug: string) => [
  "learn",
  "syllabus",
  courseSlug,
];
export const enrollmentKey = (courseId: string, userId?: string) => [
  "learn",
  "enrollment",
  courseId,
  userId,
];
export function useSyllabusQuery(courseSlug: string) {
  return useQuery({
    queryKey: syllabusKey(courseSlug),
    queryFn: ({ signal }) =>
      api<Syllabus>(
        `/public/courses/${encodeURIComponent(courseSlug)}/syllabus`,
        { signal },
        false,
      ),
    retry: false,
  });
}

const NO_PROGRESS: ReadonlySet<string> = new Set();
const EMPTY_PROGRESS: CourseProgressSummary = {
  courseId: "",
  userId: "",
  totalLessons: 0,
  totalRequiredLessons: 0,
  completedLessons: 0,
  completedRequiredLessons: 0,
  percentage: 0,
  isCompleted: false,
  updatedAt: new Date(0).toISOString(),
};

export function LearningProvider({
  courseSlug,
  syllabus,
  children,
}: {
  courseSlug: string;
  syllabus: Syllabus;
  children: ReactNode;
}) {
  const session = useSession();
  const user = session.user;
  const isStudent = Boolean(user?.roles.includes("student"));
  const hasBypass = Boolean(
    user &&
    (user.roles.includes("admin") || user.id === syllabus.instructor?.id),
  );

  const enrollment = useQuery({
    queryKey: enrollmentKey(syllabus.course.id, user?.id),
    queryFn: ({ signal }) =>
      api<{ isEnrolled: boolean }>(
        `/courses/${syllabus.course.id}/enrollment-status`,
        { signal },
      ),
    enabled: isStudent,
    retry: false,
  });
  const enrolled = enrollment.data?.isEnrolled === true;
  const progress = useCourseProgress(
    syllabus.course.id,
    user?.id,
    isStudent && enrolled,
  );

  const curriculum = syllabus.curriculum;
  const value = useMemo<LearningContextValue>(
    () => ({
      courseSlug,
      syllabus,
      curriculum,
      completed: progress.data
        ? new Set(
            progress.data.lessons
              .filter((item) => item.status === "COMPLETED")
              .map((item) => item.lessonId),
          )
        : NO_PROGRESS,
      courseProgress: progress.data ?? EMPTY_PROGRESS,
      // Advisory only: the API re-checks access on every lesson request.
      isLocked: (lesson) => !(lesson.isPreview || enrolled || hasBypass),
      isStudent,
      isAuthenticated: session.isAuthenticated,
    }),
    [
      courseSlug,
      syllabus,
      curriculum,
      enrolled,
      hasBypass,
      isStudent,
      session.isAuthenticated,
      progress.data,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLearning() {
  const value = useContext(Context);
  if (!value) throw new Error("LearningProvider missing");
  return value;
}
