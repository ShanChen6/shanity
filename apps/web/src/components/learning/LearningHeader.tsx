"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { flattenLessons, type SyllabusChapter } from "./learning-model";

export function LearningHeader({
  courseTitle,
  curriculum,
  completed,
  onOpenMenu,
}: {
  courseTitle: string;
  curriculum: SyllabusChapter[];
  completed: ReadonlySet<string>;
  onOpenMenu: () => void;
}) {
  const lessons = flattenLessons(curriculum);
  const done = lessons.filter((lesson) => completed.has(lesson.id)).length;
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        className="lg:hidden"
        aria-label="Mở giáo trình"
        onClick={onOpenMenu}
      >
        <Icon name="menu" className="size-4" aria-hidden="true" />
        Giáo trình
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{courseTitle}</h1>
      <div className="hidden w-48 items-center gap-2 sm:flex">
        <Progress
          className="flex-1"
          value={lessons.length ? (done / lessons.length) * 100 : 0}
          label="Tiến độ khóa học"
        />
        <span className="text-xs text-muted">
          {done}/{lessons.length}
        </span>
      </div>
      <Link href="/courses" className="shrink-0 text-sm text-primary underline">
        Danh mục khóa học
      </Link>
    </header>
  );
}
