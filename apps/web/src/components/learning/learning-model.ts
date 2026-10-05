export type SyllabusLesson = {
  id: string;
  title: string;
  slug: string;
  type: "TEXT" | "VIDEO" | "DOCUMENT";
  position: number;
  isPreview: boolean;
};

export type SyllabusChapter = {
  id: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  lessons: SyllabusLesson[];
};

export type Syllabus = {
  course: { id: string; title: string; slug: string };
  instructor: { id: string } | null;
  curriculum: SyllabusChapter[];
};

export type LessonStatus = "active" | "completed" | "locked" | "preview" | "default";

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
export function getAdjacentLessons(curriculum: SyllabusChapter[], slug: string) {
  const flat = flattenLessons(curriculum);
  const index = flat.findIndex((lesson) => lesson.slug === slug);
  return {
    current: index === -1 ? null : flat[index],
    previous: index > 0 ? flat[index - 1] : null,
    next: index !== -1 && index < flat.length - 1 ? flat[index + 1] : null,
  };
}

export function lessonStatus(
  lesson: SyllabusLesson,
  context: {
    activeSlug?: string;
    completed: ReadonlySet<string>;
    isLocked: (lesson: SyllabusLesson) => boolean;
  },
): LessonStatus {
  if (lesson.slug === context.activeSlug) return "active";
  if (context.completed.has(lesson.id)) return "completed";
  if (context.isLocked(lesson)) return "locked";
  if (lesson.isPreview) return "preview";
  return "default";
}

export const STATUS_SYMBOL: Record<LessonStatus, string> = {
  active: "→",
  completed: "✓",
  locked: "🔒",
  preview: "👁️",
  default: "○",
};

export const STATUS_LABEL: Record<LessonStatus, string> = {
  active: "Đang học",
  completed: "Đã hoàn thành",
  locked: "Bị khóa",
  preview: "Xem thử",
  default: "Chưa học",
};

export const learningPath = (courseSlug: string, lessonSlug: string) =>
  `/learn/${encodeURIComponent(courseSlug)}/${encodeURIComponent(lessonSlug)}`;
