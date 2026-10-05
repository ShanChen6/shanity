"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-provider";
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
  isLocked: (lesson: SyllabusLesson) => boolean;
  isStudent: boolean;
  isAuthenticated: boolean;
};

const Context = createContext<LearningContextValue | null>(null);

export const syllabusKey = (courseSlug: string) => ["learn", "syllabus", courseSlug];
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

  const curriculum = syllabus.curriculum;

  const value = useMemo<LearningContextValue>(
    () => ({
      courseSlug,
      syllabus,
      curriculum,
      // Completion tracking arrives with the progress engine.
      completed: NO_PROGRESS,
      // Advisory only: the API re-checks access on every lesson request.
      isLocked: (lesson) => !(lesson.isPreview || enrolled || hasBypass),
      isStudent,
      isAuthenticated: session.isAuthenticated,
    }),
    [courseSlug, syllabus, curriculum, enrolled, hasBypass, isStudent, session.isAuthenticated],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLearning() {
  const value = useContext(Context);
  if (!value) throw new Error("LearningProvider missing");
  return value;
}
