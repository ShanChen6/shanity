"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABEL,
  learningPath,
  lessonStatus,
  type SyllabusChapter,
  type SyllabusLesson,
} from "./learning-model";

export function CurriculumSidebar({
  courseSlug,
  curriculum,
  activeSlug,
  completed,
  isLocked,
  onNavigate,
}: {
  courseSlug: string;
  curriculum: SyllabusChapter[];
  activeSlug?: string;
  completed: ReadonlySet<string>;
  isLocked: (lesson: SyllabusLesson) => boolean;
  onNavigate?: () => void;
}) {
  const activeChapter = curriculum.find((chapter) =>
    chapter.lessons.some((lesson) => lesson.slug === activeSlug),
  )?.id;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        curriculum.filter(({ id }) => id !== activeChapter).map(({ id }) => id),
      ),
  );
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeSlug, activeChapter, collapsed]);

  if (!curriculum.length)
    return <p className="p-4 text-sm text-muted">Khóa học chưa có bài học.</p>;
  return (
    <nav aria-label="Giáo trình" className="space-y-3 p-4">
      {curriculum.map((chapter, index) => {
        const isOpen =
          chapter.id === activeChapter || !collapsed.has(chapter.id);
        return (
          <section key={chapter.id} aria-labelledby={`chapter-${chapter.id}`}>
            <button
              id={`chapter-${chapter.id}`}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`chapter-lessons-${chapter.id}`}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (isOpen) next.add(chapter.id);
                  else next.delete(chapter.id);
                  return next;
                })
              }
              className="flex w-full items-center gap-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
            >
              <ChevronRight
                aria-hidden
                size={16}
                className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              Chương {index + 1}: {chapter.title}
            </button>
            {isOpen ? (
              <ul id={`chapter-lessons-${chapter.id}`} className="space-y-1">
                {chapter.lessons.map((lesson) => {
                  const status = lessonStatus(lesson, {
                    activeSlug,
                    completed,
                    isLocked,
                  });
                  return (
                    <li key={lesson.id}>
                      <Link
                        ref={status === "active" ? activeRef : undefined}
                        href={learningPath(courseSlug, lesson.slug)}
                        aria-current={status === "active" ? "page" : undefined}
                        data-status={status}
                        onClick={onNavigate}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                          status === "active"
                            ? "border-primary bg-secondary font-semibold text-secondary-foreground"
                            : "border-transparent hover:bg-surface-hover"
                        } ${status === "locked" ? "text-muted" : ""}`}
                      >
                        <span className="w-5 shrink-0" aria-hidden>
                          {status === "completed" ? (
                            <CheckCircle2 size={17} />
                          ) : status === "locked" ? (
                            <Lock size={17} />
                          ) : (
                            <ChevronRight size={17} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {lesson.title}
                        </span>
                        <span className="sr-only">{STATUS_LABEL[status]}</span>
                        {lesson.isPreview ? (
                          <Badge tone="success">Preview</Badge>
                        ) : null}
                        {!lesson.isRequired ? (
                          <Badge tone="warning">Optional</Badge>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}
