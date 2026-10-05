"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  learningPath,
  type FlatLesson,
  type SyllabusChapter,
} from "@/components/learning/learning-model";

export type CurriculumNavigation = {
  flattenedLessons: FlatLesson[];
  currentIndex: number;
  currentLesson: FlatLesson | null;
  previousLesson: FlatLesson | null;
  nextLesson: FlatLesson | null;
};

export function buildCurriculumNavigation(
  chapters: readonly SyllabusChapter[],
  current: string,
): CurriculumNavigation {
  let globalIndex = 0;
  const flattenedLessons = chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({
      ...lesson,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      globalIndex: globalIndex++,
    })),
  );
  const currentIndex = flattenedLessons.findIndex(
    (lesson) => lesson.slug === current || lesson.id === current,
  );
  return {
    flattenedLessons,
    currentIndex,
    currentLesson: currentIndex === -1 ? null : flattenedLessons[currentIndex],
    previousLesson: currentIndex > 0 ? flattenedLessons[currentIndex - 1] : null,
    nextLesson:
      currentIndex !== -1 && currentIndex < flattenedLessons.length - 1
        ? flattenedLessons[currentIndex + 1]
        : null,
  };
}

export function useCurriculumNavigation(
  courseSlug: string,
  chapters: readonly SyllabusChapter[],
  current: string,
) {
  const router = useRouter();
  const navigation = useMemo(
    () => buildCurriculumNavigation(chapters, current),
    [chapters, current],
  );

  useEffect(() => {
    if (navigation.previousLesson)
      router.prefetch(learningPath(courseSlug, navigation.previousLesson.slug));
    if (navigation.nextLesson)
      router.prefetch(learningPath(courseSlug, navigation.nextLesson.slug));
  }, [courseSlug, navigation.previousLesson, navigation.nextLesson, router]);

  return navigation;
}
