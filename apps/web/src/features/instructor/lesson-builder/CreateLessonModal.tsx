"use client";
import { Dialog } from "@/components/ui/dialog";
import { LessonForm } from "./LessonForm";
import type { SaveLessonInput } from "./lesson-api";
import { TYPE_LABEL, type LessonType } from "./types";

export function CreateLessonModal({
  type,
  onSubmit,
  onClose,
}: {
  type: LessonType;
  onSubmit: (input: SaveLessonInput) => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={`Thêm bài học ${TYPE_LABEL[type]}`}
      onClose={onClose}
      className="max-w-2xl"
    >
      <LessonForm
        id="create-lesson-form"
        type={type}
        onSubmit={onSubmit}
        onDone={onClose}
        onCancel={onClose}
        submitLabel="Tạo bài học"
      />
    </Dialog>
  );
}
