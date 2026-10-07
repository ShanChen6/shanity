import Link from "next/link";
import { Lock } from "lucide-react";
import {
  learningPath,
  quizPath,
  type PrerequisiteLesson,
} from "../learning-model";

// Sequential course: the server refused this lesson (403
// PREREQUISITE_LESSON_NOT_COMPLETED) until `requiredLesson` is completed, or,
// with `quizId`, until that lesson's required quiz is passed.
export function PrerequisiteLockedState({
  courseSlug,
  requiredLesson,
}: {
  courseSlug: string;
  requiredLesson: PrerequisiteLesson;
}) {
  return (
    <div
      role="alert"
      data-testid="prerequisite-locked"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center sm:p-12"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-secondary text-muted">
        <Lock aria-hidden size={30} />
      </span>
      <h2 className="text-xl font-semibold">Bài học đang bị khóa</h2>
      <p className="text-sm text-muted">
        {requiredLesson.quizId
          ? "Bạn cần đạt bài quiz của bài"
          : "Bạn cần hoàn thành bài"}{" "}
        <strong className="text-foreground">{requiredLesson.title}</strong>{" "}
        trước khi truy cập bài học này.
      </p>
      <Link
        href={
          requiredLesson.quizId
            ? quizPath(courseSlug, requiredLesson.quizId)
            : learningPath(courseSlug, requiredLesson.slug)
        }
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        {requiredLesson.quizId
          ? "Đi đến bài quiz cần đạt →"
          : "Đi đến bài học cần hoàn thành →"}
      </Link>
    </div>
  );
}
