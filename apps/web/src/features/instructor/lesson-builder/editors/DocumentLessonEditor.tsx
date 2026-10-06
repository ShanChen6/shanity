"use client";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DOCUMENT_MIME, formatBytes, type ApiLesson } from "../types";
import type { LessonFormValues } from "../schema";

export function DocumentLessonEditor({
  form,
  disabled,
  progress,
  lesson,
}: {
  form: UseFormReturn<LessonFormValues>;
  disabled: boolean;
  progress: number | null;
  lesson?: ApiLesson;
}) {
  const file = useWatch({ control: form.control, name: "file" });
  const error = form.formState.errors.file?.message;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="lesson-document-file">Tệp đính kèm (PDF, Slide…)</Label>
        <Input
          id="lesson-document-file"
          type="file"
          accept={DOCUMENT_MIME.join(",")}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) =>
            form.setValue("file", event.target.files?.[0] ?? null, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
        {file ? (
          <p className="text-sm text-muted">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : (
          lesson?.documentFileName && (
            <p className="text-sm text-muted">
              Hiện tại: {lesson.documentFileName} ·{" "}
              {formatBytes(lesson.documentFileSize)}. Chọn tệp mới để thay thế.
            </p>
          )
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {progress !== null && (
          <div className="space-y-1">
            <Progress value={progress} label="Tiến độ tải tài liệu" />
            <p className="text-xs text-muted" role="status">
              Đang tải lên… {progress}%
            </p>
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox disabled={disabled} {...form.register("allowDownload")} />
        Cho phép học viên tải về
      </label>
    </div>
  );
}
