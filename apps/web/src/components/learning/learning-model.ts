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

export type FlatLesson = SyllabusLesson & { chapterId: string };

// Chapters by orderIndex, lessons by position; ties keep API order.
export function sortCurriculum(curriculum: SyllabusChapter[]): SyllabusChapter[] {
  return [...curriculum]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((chapter) => ({
      ...chapter,
      lessons: [...chapter.lessons].sort((a, b) => a.position - b.position),
    }));
}

export function flattenLessons(curriculum: SyllabusChapter[]): FlatLesson[] {
  return curriculum.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({ ...lesson, chapterId: chapter.id })),
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
