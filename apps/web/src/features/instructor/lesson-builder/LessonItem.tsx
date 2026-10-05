"use client";
import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TYPE_ICON, TYPE_LABEL, type ApiLesson } from "./types";

type Props = {
  lesson: ApiLesson;
  courseId: string;
  busy?: boolean;
  onTogglePublished: (lesson: ApiLesson, value: boolean) => void;
  onTogglePreview: (lesson: ApiLesson, value: boolean) => void;
  onEdit: (lesson: ApiLesson) => void;
  onDelete: (lesson: ApiLesson) => void;
};

function LessonItemBase({
  lesson,
  courseId,
  busy,
  onTogglePublished,
  onTogglePreview,
  onEdit,
  onDelete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3"
      data-testid={`lesson-item-${lesson.id}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Kéo để sắp xếp ${lesson.title}`}
        className="cursor-grab touch-none px-1 text-muted"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <Badge tone="info" data-testid="lesson-type-badge">
        <span aria-hidden="true">{TYPE_ICON[lesson.type]}</span>&nbsp;
        {lesson.type}
        <span className="sr-only"> ({TYPE_LABEL[lesson.type]})</span>
      </Badge>
      <span className="min-w-0 flex-1 truncate font-medium">{lesson.title}</span>
      {lesson.isPreview && <Badge tone="success">Preview</Badge>}
      <label className="flex items-center gap-2 text-xs">
        <Switch
          checked={lesson.isPublished}
          disabled={busy}
          aria-label={`Xuất bản ${lesson.title}`}
          onChange={(event) => onTogglePublished(lesson, event.target.checked)}
        />
        Xuất bản
      </label>
      <label className="flex items-center gap-2 text-xs">
        <Switch
          checked={lesson.isPreview}
          disabled={busy}
          aria-label={`Preview ${lesson.title}`}
          onChange={(event) => onTogglePreview(lesson, event.target.checked)}
        />
        Preview
      </label>
      <a
        className="text-xs text-primary underline"
        href={`/instructor/courses/${courseId}/preview`}
        target="_blank"
        rel="noreferrer"
      >
        Preview as Student
      </a>
      <Button size="sm" variant="outline" onClick={() => onEdit(lesson)}>
        Edit
      </Button>
      <Button
        size="sm"
        variant="danger"
        aria-label={`Xóa ${lesson.title}`}
        onClick={() => onDelete(lesson)}
      >
        Delete
      </Button>
    </li>
  );
}

export const LessonItem = memo(LessonItemBase);

