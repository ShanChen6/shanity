"use client";
import { Sheet } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LessonForm } from "./LessonForm";
import type { SaveLessonInput } from "./lesson-api";
import { TYPE_LABEL, type ApiLesson } from "./types";

export function EditLessonDrawer({
  lesson,
  courseId,
  onSubmit,
  onClose,
}: {
  lesson: ApiLesson;
  courseId: string;
  onSubmit: (input: SaveLessonInput) => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Sheet
      title={`Chỉnh sửa: ${lesson.title}`}
      description={`Loại bài học: ${TYPE_LABEL[lesson.type]}`}
      onClose={onClose}
    >
      <div className="flex items-center justify-between pb-4">
        <Badge tone={lesson.isPublished ? "success" : "warning"}>
          {lesson.isPublished ? "Đã xuất bản" : "Bản nháp"}
        </Badge>
        <a
          className="text-sm text-primary underline"
          href={`/instructor/courses/${courseId}/preview`}
          target="_blank"
          rel="noreferrer"
        >
          Preview as Student ↗
        </a>
      </div>
      <LessonForm
        id="edit-lesson-form"
        type={lesson.type}
        lesson={lesson}
        onSubmit={onSubmit}
        onDone={onClose}
        onCancel={onClose}
        submitLabel="Lưu thay đổi"
      />
    </Sheet>
  );
}
