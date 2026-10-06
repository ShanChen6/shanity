"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";

export function LearningHeader({
  courseTitle,
  courseProgress,
  onOpenMenu,
}: {
  courseTitle: string;
  courseProgress: {
    completedRequiredLessons: number;
    totalRequiredLessons: number;
    percentage: number;
  };
  onOpenMenu: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        className="lg:hidden"
        data-testid="curriculum-toggle"
        aria-label="Mở giáo trình"
        onClick={onOpenMenu}
      >
        <Icon name="menu" className="size-4" aria-hidden="true" />
        Giáo trình
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
        {courseTitle}
      </h1>
      <div className="hidden w-80 items-center gap-2 sm:flex">
        <Progress
          className="flex-1"
          value={courseProgress.percentage}
          label="Tiến độ khóa học"
        />
        <span className="text-xs text-muted">
          Đã hoàn thành {courseProgress.completedRequiredLessons}/
          {courseProgress.totalRequiredLessons} bài học bắt buộc
        </span>
      </div>
      <Link href="/courses" className="shrink-0 text-sm text-primary underline">
        Danh mục khóa học
      </Link>
    </header>
  );
}
