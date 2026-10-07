"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ApiLesson } from "@/features/instructor/lesson-builder/types";
import { importFailure, importLesson } from "./api";
import { FileDropzone } from "./FileDropzone";
import { ImportIssueList } from "./ImportIssueList";
import { LESSON_TEMPLATES, TemplateLinks } from "./TemplateLinks";

/**
 * Creates a TEXT lesson in `chapterId` from a Markdown or JSON file. The
 * server sanitizes the HTML and stores the lesson unpublished, so the
 * instructor reviews it before learners can see it.
 */
export function ImportLessonDialog({
  chapterId,
  onImported,
  onClose,
}: {
  chapterId: string;
  onImported: (lesson: ApiLesson) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const upload = useMutation({
    mutationFn: () => importLesson(chapterId, file!, title),
    onSuccess: (lesson) => {
      onImported(lesson);
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file) upload.mutate();
  };

  return (
    <Dialog
      title="Import bài học từ file"
      description="Tạo bài học dạng văn bản từ file Markdown hoặc JSON."
      onClose={onClose}
      busy={upload.isPending}
      className="max-w-xl"
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        <FileDropzone
          formats={["markdown", "json"]}
          file={file}
          disabled={upload.isPending}
          onChange={(next) => {
            setFile(next);
            upload.reset();
          }}
        />
        <label className="block text-sm font-medium">
          Tiêu đề (tùy chọn)
          <Input
            className="mt-2"
            value={title}
            maxLength={255}
            disabled={upload.isPending}
            placeholder="Để trống để dùng tiêu đề trong file"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <Alert tone="info">
          Bài học được tạo ở trạng thái <strong>chưa xuất bản</strong>. Mã HTML
          không an toàn (script, iframe, sự kiện onclick…) sẽ tự động bị loại
          bỏ.
        </Alert>
        <TemplateLinks templates={LESSON_TEMPLATES} />
        {upload.error ? (
          <ImportIssueList failure={importFailure(upload.error)} />
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={upload.isPending}
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={!file}
            loading={upload.isPending}
            loadingLabel="Đang import…"
          >
            Import bài học
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
