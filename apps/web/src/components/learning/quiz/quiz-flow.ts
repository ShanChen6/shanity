import type { CourseQuiz } from "@/features/quiz-player/api";
import {
  flattenLessons,
  type FlatLesson,
  type SyllabusChapter,
} from "../learning-model";

/**
 * The completion gate after a submitted attempt (mirrors the server's
 * progress rule): a required quiz only counts once passed; an optional one
 * counts as soon as it is submitted, pass or fail.
 */
export function stepCompletedBy(
  quiz: Pick<CourseQuiz, "isRequired">,
  passed: boolean,
): boolean {
  return quiz.isRequired ? passed : true;
}

/** Another attempt may start: unlimited, or attempts left. */
export const canRetry = (quiz: Pick<CourseQuiz, "attemptsRemaining">) =>
  quiz.attemptsRemaining === null || quiz.attemptsRemaining > 0;

/**
 * Where "Continue" leads after a quiz: the lesson after a lesson quiz, the
 * first lesson of the next chapter after a chapter quiz, nothing after a
 * course quiz (the course is over).
 */
export function nextLessonAfterQuiz(
  curriculum: SyllabusChapter[],
  quiz: Pick<CourseQuiz, "scope" | "targetId">,
): FlatLesson | null {
  const flat = flattenLessons(curriculum);
  if (quiz.scope === "LESSON") {
    const index = flat.findIndex(({ id }) => id === quiz.targetId);
    return index === -1 ? null : (flat[index + 1] ?? null);
  }
  if (quiz.scope === "CHAPTER") {
    const chapter = curriculum.findIndex(({ id }) => id === quiz.targetId);
    if (chapter === -1) return null;
    const later = new Set(curriculum.slice(chapter + 1).map(({ id }) => id));
    return flat.find(({ chapterId }) => later.has(chapterId)) ?? null;
  }
  return null;
}

export {
  AutosaveQueue,
  formatRemaining,
  type SaveState,
} from "@/features/quiz-player/autosave";
