"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABEL,
  STATUS_SYMBOL,
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
  if (!curriculum.length)
    return <p className="p-4 text-sm text-muted">Khóa học chưa có bài học.</p>;
  return (
    <nav aria-label="Giáo trình" className="space-y-5 p-4">
      {curriculum.map((chapter, index) => (
        <section key={chapter.id} aria-labelledby={`chapter-${chapter.id}`}>
          <h2
            id={`chapter-${chapter.id}`}
            className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Chương {index + 1}: {chapter.title}
          </h2>
          <ul className="space-y-1">
            {chapter.lessons.map((lesson) => {
              const status = lessonStatus(lesson, { activeSlug, completed, isLocked });
              return (
                <li key={lesson.id}>
                  <Link
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
                    <span aria-hidden="true" className="w-5 shrink-0 text-center">
                      {STATUS_SYMBOL[status]}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                    <span className="sr-only">{STATUS_LABEL[status]}</span>
                    {lesson.isPreview && status !== "preview" && (
                      <Badge tone="success">Preview</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
