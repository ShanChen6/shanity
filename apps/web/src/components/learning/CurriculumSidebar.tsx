"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Lock,
  PlayCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABEL,
  learningPath,
  type LessonProgressStatus,
  type PrerequisiteLesson,
  type SyllabusChapter,
  type SyllabusLesson,
} from "./learning-model";

const STATUS_ICON: Record<LessonProgressStatus, ReactNode> = {
  COMPLETED: <CheckCircle2 size={17} className="text-success" />,
  IN_PROGRESS: <PlayCircle size={17} className="text-primary" />,
  LOCKED: <Lock size={16} className="text-muted" />,
  NOT_STARTED: <Circle size={17} className="text-border-strong" />,
};

export function CurriculumSidebar({
  courseSlug,
  curriculum,
  activeSlug,
  statusOf,
  prerequisiteOf,
  onNavigate,
}: {
  courseSlug: string;
  curriculum: SyllabusChapter[];
  activeSlug?: string;
  statusOf: (lesson: SyllabusLesson) => LessonProgressStatus;
  prerequisiteOf?: (lesson: SyllabusLesson) => PrerequisiteLesson | null;
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
  const activeRef = useRef<HTMLLIElement>(null);

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
        const done = chapter.lessons.filter(
          (lesson) => statusOf(lesson) === "COMPLETED",
        ).length;
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
              <span className="min-w-0 flex-1">
                Chương {index + 1}: {chapter.title}
              </span>
              <span
                className={`shrink-0 tabular-nums normal-case ${done === chapter.lessons.length && done ? "text-success" : ""}`}
              >
                {done}/{chapter.lessons.length}
                <span className="sr-only"> bài đã hoàn thành</span>
              </span>
            </button>
            {isOpen ? (
              <ul id={`chapter-lessons-${chapter.id}`} className="space-y-1">
                {chapter.lessons.map((lesson) => {
                  const status = statusOf(lesson);
                  const active = lesson.slug === activeSlug;
                  const prerequisite = prerequisiteOf?.(lesson) ?? null;
                  const className = `flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors duration-normal ${
                    active
                      ? "border-primary/60 bg-secondary font-semibold text-secondary-foreground shadow-sm"
                      : prerequisite
                        ? "cursor-not-allowed border-transparent opacity-70"
                        : "border-transparent hover:bg-surface-hover"
                  } ${status === "LOCKED" ? "text-muted" : ""}`;
                  const content = (
                    <>
                      <span
                        className="flex w-5 shrink-0 justify-center"
                        aria-hidden
                        data-testid={`lesson-status-${lesson.id}`}
                        data-icon={status}
                      >
                        {STATUS_ICON[status]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{lesson.title}</span>
                        {prerequisite ? (
                          <span className="block truncate text-xs font-normal">
                            Hoàn thành “{prerequisite.title}” để mở khóa
                          </span>
                        ) : null}
                      </span>
                      <span className="sr-only">{STATUS_LABEL[status]}</span>
                      {lesson.isPreview ? (
                        <Badge tone="success">Preview</Badge>
                      ) : null}
                      {!lesson.isRequired ? (
                        <Badge tone="warning">Optional</Badge>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={lesson.id} ref={active ? activeRef : undefined}>
                      {prerequisite ? (
                        // Sequentially locked: not navigable. (Lessons locked
                        // only by enrollment stay links to the enroll prompt.)
                        <span
                          role="link"
                          aria-disabled="true"
                          aria-current={active ? "page" : undefined}
                          data-status={status}
                          title={`Bạn cần hoàn thành bài “${prerequisite.title}” trước`}
                          className={className}
                        >
                          {content}
                        </span>
                      ) : (
                        <Link
                          href={learningPath(courseSlug, lesson.slug)}
                          aria-current={active ? "page" : undefined}
                          data-status={status}
                          onClick={onNavigate}
                          className={className}
                        >
                          {content}
                        </Link>
                      )}
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
