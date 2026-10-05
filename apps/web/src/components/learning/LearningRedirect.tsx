"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLearning } from "./learning-context";
import { flattenLessons, learningPath } from "./learning-model";
import { LearningNotFound } from "./states/LearningNotFound";
import { LessonSkeleton } from "./states/LessonSkeleton";

// /learn/[courseSlug] lands on the first accessible lesson.
export function LearningRedirect() {
  const { courseSlug, curriculum, isLocked } = useLearning();
  const router = useRouter();
  const lessons = flattenLessons(curriculum);
  const first = lessons.find((lesson) => !isLocked(lesson)) ?? lessons[0];
  useEffect(() => {
    if (first) router.replace(learningPath(courseSlug, first.slug));
  }, [first, courseSlug, router]);
  return first ? <LessonSkeleton /> : <LearningNotFound scope="lesson" courseSlug={courseSlug} />;
}
