"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurriculumNavigation } from "@/hooks/useCurriculumNavigation";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import {
  learningPath,
  type FlatLesson,
  type SyllabusChapter,
  type SyllabusLesson,
} from "./learning-model";

function NavButton({ target, direction, disabledReason, pending, onNavigate }: {
  target: FlatLesson | null;
  direction: "previous" | "next";
  disabledReason?: string;
  pending: boolean;
  onNavigate: () => void;
}) {
  const previous = direction === "previous";
  const label = previous ? "Previous Lesson" : "Next Lesson";
  return (
    <Button
      variant="outline"
      disabled={!target || Boolean(disabledReason) || pending}
      title={disabledReason}
      aria-label={label}
      onClick={onNavigate}
      className="min-w-0 gap-2"
    >
      {previous ? <ChevronLeft aria-hidden size={18} /> : null}
      {disabledReason ? <Lock aria-hidden size={16} /> : null}
      <span>{pending ? "Loading…" : label}</span>
      {!previous ? <ChevronRight aria-hidden size={18} /> : null}
    </Button>
  );
}

export function LearningFooter({ courseSlug, curriculum, activeSlug, isLocked }: {
  courseSlug: string;
  curriculum: SyllabusChapter[];
  activeSlug: string;
  isLocked: (lesson: SyllabusLesson) => boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { previousLesson, nextLesson } = useCurriculumNavigation(
    courseSlug,
    curriculum,
    activeSlug,
  );
  const nextLocked = Boolean(nextLesson && isLocked(nextLesson));
  const navigate = useCallback((target: FlatLesson | null) => {
    if (!target) return;
    startTransition(() => router.push(learningPath(courseSlug, target.slug)));
  }, [courseSlug, router]);
  const goPrevious = useCallback(() => navigate(previousLesson), [navigate, previousLesson]);
  const goNext = useCallback(() => {
    if (!nextLocked) navigate(nextLesson);
  }, [navigate, nextLesson, nextLocked]);

  useKeyboardNavigation({
    onPrevious: previousLesson ? goPrevious : undefined,
    onNext: nextLesson && !nextLocked ? goNext : undefined,
    disabled: isPending,
  });

  return (
    <footer
      aria-busy={isPending}
      className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3"
    >
      <NavButton target={previousLesson} direction="previous" pending={isPending} onNavigate={goPrevious} />
      <NavButton
        target={nextLesson}
        direction="next"
        disabledReason={nextLocked ? "Bài học tiếp theo bị khóa" : undefined}
        pending={isPending}
        onNavigate={goNext}
      />
    </footer>
  );
}
