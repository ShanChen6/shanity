"use client";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { VIDEO_MIME, formatBytes, type ApiLesson } from "../types";
import type { LessonFormValues } from "../schema";

export function VideoLessonEditor({
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
  const source = useWatch({ control: form.control, name: "source" });
  const file = useWatch({ control: form.control, name: "file" });
  const errors = form.formState.errors;
  return (
    <div className="space-y-3">
      <fieldset className="flex gap-4" disabled={disabled}>
        <legend className="pb-1 text-sm font-medium">Nguồn video</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="url" {...form.register("source")} />
          Nhúng URL (YouTube / Vimeo)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="upload" {...form.register("source")} />
          Tải video lên
        </label>
      </fieldset>

      {source === "url" ? (
        <div className="space-y-2">
          <Label htmlFor="lesson-video-url">URL video</Label>
          <Input
            id="lesson-video-url"
            type="url"
            disabled={disabled}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-invalid={errors.videoUrl ? true : undefined}
            {...form.register("videoUrl")}
          />
          {errors.videoUrl && (
            <p className="text-sm text-danger">{errors.videoUrl.message}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="lesson-video-file">Tệp video (MP4, WebM, MOV)</Label>
          <Input
            id="lesson-video-file"
            type="file"
            accept={VIDEO_MIME.join(",")}
            disabled={disabled}
            aria-invalid={errors.file ? true : undefined}
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
            lesson?.videoAssetId && (
              <p className="text-sm text-muted">
                Đang dùng video đã tải lên ({formatBytes(lesson.videoFileSize)}
                ). Chọn tệp mới để thay thế.
              </p>
            )
          )}
          {errors.file && (
            <p className="text-sm text-danger">{errors.file.message}</p>
          )}
          {progress !== null && (
            <div className="space-y-1">
              <Progress value={progress} label="Tiến độ tải video" />
              <p className="text-xs text-muted" role="status">
                Đang tải lên… {progress}%
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
