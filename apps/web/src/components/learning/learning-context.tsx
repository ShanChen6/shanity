"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-provider";
import {
  type CourseProgressSummary,
  type ServerLessonStatus,
  useCourseProgress,
} from "@/features/progress/use-course-progress";
import { api } from "@/lib/api";
import { useCourseQuizzes, type CourseQuiz } from "@/features/quiz-player/api";
import {
  lessonProgressStatus,
  sequentialLocks,
  type LessonProgressStatus,
  type PrerequisiteLesson,
  type Syllabus,
  type SyllabusChapter,
  type SyllabusLesson,
} from "./learning-model";

type LearningContextValue = {
  courseSlug: string;
  syllabus: Syllabus;
  curriculum: SyllabusChapter[];
  courseProgress: CourseProgressSummary;
  isLocked: (lesson: SyllabusLesson) => boolean;
  // Sequential courses: the earlier required lesson to finish first, if any.
  prerequisiteOf: (lesson: SyllabusLesson) => PrerequisiteLesson | null;
  statusOf: (lesson: SyllabusLesson) => LessonProgressStatus;
  isStudent: boolean;
  isAuthenticated: boolean;
  // Enrolled student whose progress the server records.
  isTracking: boolean;
  // Published course-bound quizzes with this learner's standing.
  quizzes: CourseQuiz[];
  quizzesOf: (scope: CourseQuiz["scope"], targetId: string) => CourseQuiz[];
  isQuizLocked: (quiz: CourseQuiz) => boolean;
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

const NO_PROGRESS: ReadonlyMap<string, ServerLessonStatus> = new Map();
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

  const quizQuery = useCourseQuizzes(
    syllabus.course.id,
    user?.id,
    (isStudent && enrolled) || hasBypass,
  );
  const quizzes = quizQuery.data;

  const curriculum = syllabus.curriculum;
  const value = useMemo<LearningContextValue>(() => {
    const quizList = quizzes ?? [];
    const quizzesOf = (scope: CourseQuiz["scope"], targetId: string) =>
      quizList.filter(
        (quiz) => quiz.scope === scope && quiz.targetId === targetId,
      );
    // A lesson's required quiz not yet passed holds back later lessons.
    const pendingQuizOf = (lessonId: string) =>
      quizzesOf("LESSON", lessonId).find(
        (quiz) => quiz.isRequired && !quiz.isPassed,
      )?.id ?? null;
    const statuses = progress.data
      ? new Map(
          progress.data.lessons.map((item) => [item.lessonId, item.status]),
        )
      : NO_PROGRESS;
    // Staff are never locked; locks wait for real progress to avoid flashing
    // every lesson as locked while it loads.
    const locks =
      syllabus.course.isSequential &&
      isStudent &&
      enrolled &&
      !hasBypass &&
      progress.data &&
      (quizzes || quizQuery.isError)
        ? sequentialLocks(
            curriculum,
            (lessonId) => statuses.get(lessonId) === "COMPLETED",
            pendingQuizOf,
          )
        : null;
    const prerequisiteOf = (lesson: SyllabusLesson) =>
      locks?.get(lesson.id) ?? null;
    // Advisory only: the API re-checks access on every lesson request.
    const isLocked = (lesson: SyllabusLesson) =>
      !(lesson.isPreview || enrolled || hasBypass) ||
      Boolean(prerequisiteOf(lesson));
    return {
      courseSlug,
      syllabus,
      curriculum,
      courseProgress: progress.data ?? EMPTY_PROGRESS,
      isLocked,
      prerequisiteOf,
      statusOf: (lesson) =>
        lessonProgressStatus(lesson, { statuses, isLocked }),
      isStudent,
      isAuthenticated: session.isAuthenticated,
      isTracking: isStudent && enrolled,
      quizzes: quizList,
      quizzesOf,
      // Advisory like isLocked: the API re-checks on start.
      isQuizLocked: (quiz) => {
        if (!(enrolled || hasBypass)) return true;
        if (quiz.scope !== "LESSON") return false;
        const lesson = curriculum
          .flatMap((chapter) => chapter.lessons)
          .find(({ id }) => id === quiz.targetId);
        return lesson ? isLocked(lesson) : false;
      },
    };
  }, [
    quizzes,
    quizQuery.isError,
    courseSlug,
    syllabus,
    curriculum,
    enrolled,
    hasBypass,
    isStudent,
    session.isAuthenticated,
    progress.data,
  ]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLearning() {
  const value = useContext(Context);
  if (!value) throw new Error("LearningProvider missing");
  return value;
}

// Chapters with each lesson's server status (COMPLETED / IN_PROGRESS / LOCKED /
// NOT_STARTED). Derived from the course progress query, so a progress mutation
// that updates that cache re-renders the curriculum immediately.
export function useCurriculum() {
  const { curriculum, statusOf } = useLearning();
  return useMemo(
    () =>
      curriculum.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((lesson) => ({
          ...lesson,
          status: statusOf(lesson),
        })),
      })),
    [curriculum, statusOf],
  );
}
