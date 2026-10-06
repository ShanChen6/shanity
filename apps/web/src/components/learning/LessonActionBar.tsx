"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurriculumNavigation } from "@/hooks/useCurriculumNavigation";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import {
  learningPath,
  type FlatLesson,
  type SyllabusChapter,
  type SyllabusLesson,
} from "./learning-model";

export type LessonCompletionState =
  // Guests, previews and staff: navigation only, nothing is recorded.
  | { kind: "untracked" }
  | { kind: "completed" }
  // `hint` explains why completion is not yet allowed (evidence missing).
  | { kind: "incomplete"; hint?: string };

export function LessonActionBar({
  courseSlug,
  curriculum,
  activeSlug,
  isLocked,
  completion = { kind: "untracked" },
  onComplete,
}: {
  courseSlug: string;
  curriculum: SyllabusChapter[];
  activeSlug: string;
  isLocked: (lesson: SyllabusLesson) => boolean;
  completion?: LessonCompletionState;
  // Resolves true to continue to the next lesson, false to stay.
  onComplete?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [completing, setCompleting] = useState(false);
  const { flattenedLessons, previousLesson, nextLesson } =
    useCurriculumNavigation(courseSlug, curriculum, activeSlug);
  const nextLocked = Boolean(nextLesson && isLocked(nextLesson));
  const busy = isPending || completing;

  const navigate = useCallback(
    (target: FlatLesson | null) => {
      if (!target) return;
      startTransition(() => router.push(learningPath(courseSlug, target.slug)));
    },
    [courseSlug, router],
  );
  const goPrevious = useCallback(
    () => navigate(previousLesson),
    [navigate, previousLesson],
  );
  const goNext = useCallback(() => {
    if (!nextLocked) navigate(nextLesson);
  }, [navigate, nextLesson, nextLocked]);

  useKeyboardNavigation({
    onPrevious: previousLesson ? goPrevious : undefined,
    onNext: nextLesson && !nextLocked ? goNext : undefined,
    disabled: busy,
  });

  async function complete() {
    if (!onComplete || completing) return;
    setCompleting(true);
    try {
      // Not goNext(): its lock flag predates this completion, which is exactly
      // what unlocks the next lesson in a sequential course.
      if (await onComplete()) navigate(nextLesson);
    } finally {
      setCompleting(false);
    }
  }

  const nextButton = (variant: "primary" | "outline") => (
    <Button
      variant={variant}
      disabled={!nextLesson || nextLocked || busy}
      title={nextLocked ? "Bài học tiếp theo bị khóa" : undefined}
      aria-label="Bài tiếp theo"
      onClick={goNext}
      className="gap-2"
    >
      {nextLocked ? <Lock aria-hidden size={16} /> : null}
      <span className="hidden sm:inline">
        {isPending ? "Đang tải…" : "Bài tiếp theo"}
      </span>
      <ChevronRight aria-hidden size={18} />
    </Button>
  );

  let actions;
  if (completion.kind === "completed") {
    const first = flattenedLessons[0];
    actions = (
      <>
        <Badge tone="success" className="gap-1" data-testid="lesson-completed">
          <CheckCircle2 aria-hidden size={14} /> Đã hoàn thành
        </Badge>
        {nextLesson ? (
          nextButton("primary")
        ) : first ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => navigate(first)}
          >
            Xem lại từ đầu
          </Button>
        ) : null}
      </>
    );
  } else if (completion.kind === "incomplete") {
    const label = nextLesson
      ? "Đánh dấu Hoàn thành & Sang bài tiếp theo"
      : "Hoàn thành khóa học";
    actions = (
      <>
        {completion.hint ? (
          <p className="hidden max-w-64 text-right text-xs text-muted md:block">
            {completion.hint}
          </p>
        ) : null}
        {nextLesson ? nextButton("outline") : null}
        <Button
          disabled={Boolean(completion.hint) || busy}
          loading={completing}
          loadingLabel="Đang lưu…"
          aria-label={label}
          title={completion.hint}
          onClick={() => void complete()}
          className="gap-2"
        >
          <span className="sm:hidden">Hoàn thành</span>
          <span className="hidden sm:inline">{label}</span>
          {nextLesson ? <ChevronRight aria-hidden size={18} /> : null}
        </Button>
      </>
    );
  } else actions = nextButton("primary");

  return (
    <footer
      aria-label="Điều hướng bài học"
      aria-busy={busy}
      className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <Button
        variant="outline"
        disabled={!previousLesson || busy}
        aria-label="Quay lại bài trước"
        onClick={goPrevious}
        className="gap-2"
      >
        <ChevronLeft aria-hidden size={18} />
        <span className="hidden sm:inline">Bài trước</span>
      </Button>
      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        {actions}
      </div>
    </footer>
  );
}
