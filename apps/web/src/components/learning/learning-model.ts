export type SyllabusLesson = {
  id: string;
  title: string;
  slug: string;
  type: "TEXT" | "VIDEO" | "DOCUMENT";
  position: number;
  isPreview: boolean;
  isRequired: boolean;
};

export type SyllabusChapter = {
  id: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  lessons: SyllabusLesson[];
};

export type Syllabus = {
  course: {
    id: string;
    title: string;
    slug: string;
    // Students must complete required lessons in order.
    isSequential?: boolean;
  };
  instructor: { id: string } | null;
  curriculum: SyllabusChapter[];
};

// Sidebar status. "Active" (the open lesson) is highlighted separately.
export type LessonProgressStatus =
  "COMPLETED" | "IN_PROGRESS" | "LOCKED" | "NOT_STARTED";

export type FlatLesson = SyllabusLesson & {
  chapterId: string;
  chapterTitle: string;
  globalIndex: number;
};

export function flattenLessons(curriculum: SyllabusChapter[]): FlatLesson[] {
  let globalIndex = 0;
  return curriculum.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({
      ...lesson,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      globalIndex: globalIndex++,
    })),
  );
}

// Crosses chapter boundaries: first lesson of the next chapter follows the last of the previous one.
export function getAdjacentLessons(
  curriculum: SyllabusChapter[],
  slug: string,
) {
  const flat = flattenLessons(curriculum);
  const index = flat.findIndex((lesson) => lesson.slug === slug);
  return {
    current: index === -1 ? null : flat[index],
    previous: index > 0 ? flat[index - 1] : null,
    next: index !== -1 && index < flat.length - 1 ? flat[index + 1] : null,
  };
}

export function lessonProgressStatus(
  lesson: SyllabusLesson,
  context: {
    statuses: ReadonlyMap<string, "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED">;
    isLocked: (lesson: SyllabusLesson) => boolean;
  },
): LessonProgressStatus {
  if (context.isLocked(lesson)) return "LOCKED";
  return context.statuses.get(lesson.id) ?? "NOT_STARTED";
}

export type PrerequisiteLesson = {
  id: string;
  title: string;
  slug: string;
  // Set when what remains is passing this lesson's required quiz.
  quizId?: string | null;
};

// Mirror of the server rule (CourseAccessService): in a sequential course a
// lesson is locked behind the first earlier lesson that is not done: a
// required lesson not yet completed, or any lesson whose required quiz is not
// passed yet (`pendingQuizOf`). Optional lessons never block on their own;
// previews are never locked (they are public).
// Returns lessonId -> the lesson to finish first.
export function sequentialLocks(
  curriculum: SyllabusChapter[],
  isCompleted: (lessonId: string) => boolean,
  pendingQuizOf: (lessonId: string) => string | null = () => null,
): ReadonlyMap<string, PrerequisiteLesson> {
  const locks = new Map<string, PrerequisiteLesson>();
  let blocker: PrerequisiteLesson | null = null;
  for (const lesson of flattenLessons(curriculum)) {
    if (blocker && !lesson.isPreview) locks.set(lesson.id, blocker);
    if (blocker) continue;
    const quizId = pendingQuizOf(lesson.id);
    if ((lesson.isRequired && !isCompleted(lesson.id)) || quizId)
      blocker = {
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug,
        ...(quizId && !(lesson.isRequired && !isCompleted(lesson.id))
          ? { quizId }
          : {}),
      };
  }
  return locks;
}

export const STATUS_LABEL: Record<LessonProgressStatus, string> = {
  COMPLETED: "Đã hoàn thành",
  IN_PROGRESS: "Đang học dở",
  LOCKED: "Bị khóa",
  NOT_STARTED: "Chưa học",
};

export const learningPath = (courseSlug: string, lessonSlug: string) =>
  `/learn/${encodeURIComponent(courseSlug)}/${encodeURIComponent(lessonSlug)}`;

export const quizPath = (courseSlug: string, quizId: string) =>
  `/learn/${encodeURIComponent(courseSlug)}/quiz/${encodeURIComponent(quizId)}`;
