"use client";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function LearningHeader({
  courseTitle,
  courseProgress,
  showProgress = true,
  chatHref,
  chatActive = false,
  onOpenMenu,
}: {
  courseTitle: string;
  /** The course's discussion room; omitted when the viewer cannot join. */
  chatHref?: string;
  chatActive?: boolean;
  courseProgress: {
    completedRequiredLessons: number;
    totalRequiredLessons: number;
    percentage: number;
  };
  // Only enrolled students have server-side progress to show.
  showProgress?: boolean;
  onOpenMenu: () => void;
}) {
  const { percentage } = courseProgress;
  const done = percentage >= 100;
  // Slow, eased width change so a completion visibly "fills" the bar.
  const indicator = cn(
    "duration-slow ease-out",
    done ? "bg-lesson-completed" : "bg-course-progress",
  );
  return (
    <header className="relative shrink-0 border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
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
        {showProgress && (
          <div
            className="flex shrink-0 items-center gap-3 sm:w-80"
            data-testid="course-progress"
          >
            <Progress
              className="hidden flex-1 sm:block"
              value={percentage}
              label="Tiến độ khóa học"
              indicatorClassName={indicator}
            />
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                done ? "text-success" : "text-foreground",
              )}
              aria-live="polite"
              title={`Đã hoàn thành ${courseProgress.completedRequiredLessons}/${courseProgress.totalRequiredLessons} bài học bắt buộc`}
            >
              <span className="hidden text-muted sm:inline">Tiến độ: </span>
              {percentage}%
            </span>
          </div>
        )}
        {chatHref && (
          <Link
            href={chatHref}
            aria-current={chatActive ? "page" : undefined}
            data-testid="course-chat-link"
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold",
              chatActive
                ? "border-transparent bg-secondary text-secondary-foreground"
                : "border-border-strong hover:bg-surface-hover",
            )}
          >
            <MessagesSquare className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Thảo luận</span>
          </Link>
        )}
        <Link
          href="/my-learning"
          className="hidden shrink-0 text-sm text-primary underline md:inline"
        >
          Góc học tập
        </Link>
      </div>
      {showProgress && (
        <Progress
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-none sm:hidden"
          value={percentage}
          label="Tiến độ khóa học"
          aria-hidden
          indicatorClassName={indicator}
        />
      )}
    </header>
  );
}
