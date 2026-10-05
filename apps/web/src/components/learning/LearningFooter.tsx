"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  learningPath,
  type FlatLesson,
  type SyllabusChapter,
  getAdjacentLessons,
  type SyllabusLesson,
} from "./learning-model";

const linkClass =
  "inline-flex control min-w-0 items-center justify-center gap-2 rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover";

function NavButton({
  courseSlug,
  target,
  label,
  disabledReason,
}: {
  courseSlug: string;
  target: FlatLesson | null;
  label: string;
  disabledReason?: string;
}) {
  if (!target || disabledReason)
    return (
      <Button variant="outline" disabled title={disabledReason}>
        {label}
      </Button>
    );
  return (
    <Link href={learningPath(courseSlug, target.slug)} className={linkClass}>
      {label}
    </Link>
  );
}

export function LearningFooter({
  courseSlug,
  curriculum,
  activeSlug,
  isLocked,
}: {
  courseSlug: string;
  curriculum: SyllabusChapter[];
  activeSlug: string;
  isLocked: (lesson: SyllabusLesson) => boolean;
}) {
  const { previous, next } = getAdjacentLessons(curriculum, activeSlug);
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3">
      <NavButton courseSlug={courseSlug} target={previous} label="← Previous Lesson" />
      <NavButton
        courseSlug={courseSlug}
        target={next}
        label="Next Lesson →"
        disabledReason={next && isLocked(next) ? "Bài học tiếp theo bị khóa" : undefined}
      />
    </footer>
  );
}
