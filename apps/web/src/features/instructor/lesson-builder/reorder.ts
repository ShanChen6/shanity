import type { ApiLesson } from "./types";

export type LessonOrderPayload = {
  lessonOrders: { id: string; position: number }[];
};

export const sortLessons = (lessons: ApiLesson[]) =>
  [...lessons].sort((a, b) => a.position - b.position);

// Returns the new order, or null when the drop does not change anything.
export function reorderAfterDrag(
  lessons: ApiLesson[],
  activeId: string,
  overId: string | null | undefined,
): ApiLesson[] | null {
  if (!overId || activeId === overId) return null;
  const from = lessons.findIndex((lesson) => lesson.id === activeId);
  const to = lessons.findIndex((lesson) => lesson.id === overId);
  if (from < 0 || to < 0) return null;
  const next = [...lessons];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((lesson, position) => ({ ...lesson, position }));
}

export const toReorderPayload = (lessons: ApiLesson[]): LessonOrderPayload => ({
  lessonOrders: lessons.map((lesson, position) => ({
    id: lesson.id,
    position,
  })),
});
