"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { message } from "../data";
import { DocumentLessonEditor } from "./editors/DocumentLessonEditor";
import { TextLessonEditor } from "./editors/TextLessonEditor";
import { VideoLessonEditor } from "./editors/VideoLessonEditor";
import { lessonFormSchema, slugify, type LessonFormValues } from "./schema";
import type { SaveLessonInput } from "./lesson-api";
import type { ApiLesson, LessonType } from "./types";

type Submit = (input: SaveLessonInput) => Promise<unknown>;

export function defaultsFor(lesson?: ApiLesson): LessonFormValues {
  return {
    title: lesson?.title ?? "",
    isPreview: lesson?.isPreview ?? false,
    isRequired: lesson?.isRequired ?? true,
    textBody: lesson?.textBody ?? "",
    source: lesson?.videoProvider === "LOCAL" ? "upload" : "url",
    videoUrl: lesson?.videoExternalUrl ?? "",
    file: null,
    allowDownload: lesson?.documentDownloadAllowed ?? false,
  };
}

export function LessonForm({
  id,
  type,
  lesson,
  onSubmit,
  onDone,
  onCancel,
  submitLabel,
}: {
  id: string;
  type: LessonType;
  lesson?: ApiLesson;
  onSubmit: Submit;
  onDone: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const hasStoredFile = Boolean(
    lesson?.videoAssetId || lesson?.documentAssetId,
  );
  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema(type, { hasStoredFile })),
    defaultValues: defaultsFor(lesson),
  });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const title = useWatch({ control: form.control, name: "title" });
  const { isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError("");
    setProgress(null);
    const onProgress = (percent: number) => setProgress(percent);
    try {
      await onSubmit(
        lesson
          ? { mode: "edit", lesson, values, onProgress }
          : { mode: "create", type, values, onProgress },
      );
      onDone();
    } catch (cause) {
      setError(message(cause));
      setProgress(null);
    }
  });

  return (
    <form id={id} onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={`${id}-title`}>Tiêu đề bài học</Label>
        <Input
          id={`${id}-title`}
          disabled={isSubmitting}
          aria-invalid={form.formState.errors.title ? true : undefined}
          {...form.register("title")}
        />
        {form.formState.errors.title && (
          <p className="text-sm text-danger">
            {form.formState.errors.title.message}
          </p>
        )}
        <p className="text-xs text-muted">
          Slug: <code>{lesson?.slug ?? (slugify(title) || "tự động tạo")}</code>
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Cho phép xem thử (Preview)</span>
        <Switch disabled={isSubmitting} {...form.register("isPreview")} />
      </label>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Bài học bắt buộc</span>
        <Switch disabled={isSubmitting} {...form.register("isRequired")} />
      </label>

      {type === "TEXT" && (
        <TextLessonEditor form={form} disabled={isSubmitting} />
      )}
      {type === "VIDEO" && (
        <VideoLessonEditor
          form={form}
          disabled={isSubmitting}
          progress={progress}
          lesson={lesson}
        />
      )}
      {type === "DOCUMENT" && (
        <DocumentLessonEditor
          form={form}
          disabled={isSubmitting}
          progress={progress}
          lesson={lesson}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" disabled={isSubmitting} onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" loading={isSubmitting} loadingLabel="Đang lưu…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
