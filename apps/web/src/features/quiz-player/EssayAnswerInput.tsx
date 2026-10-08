"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api";
import type { AttemptQuestion, EssayAnswerValue, EssayAttachment } from "./api";
import { KatexText } from "./KatexText";
import { useAutoSaveAnswer, type AutoSaveStatus } from "./useAutoSaveAnswer";

const timeOf = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

export const wordCount = (text: string) =>
  text.trim() ? text.trim().split(/\s+/u).length : 0;

/** True when the answer holds text or at least one attachment. */
export const hasEssayContent = (answer?: EssayAnswerValue | null) =>
  Boolean(answer?.text?.trim() || answer?.attachments?.length);

export function SaveIndicator({
  status,
  savedAt,
  onRetry,
}: {
  status: AutoSaveStatus;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="essay-save-status"
      data-status={status}
      className={`flex min-h-5 items-center gap-2 text-xs ${
        status === "error" ? "text-danger-foreground" : "text-muted"
      }`}
    >
      {status === "dirty" ? "Unsaved changes..." : null}
      {status === "syncing" ? "Saving..." : null}
      {status === "success"
        ? `✓ Saved${savedAt ? ` at ${timeOf(savedAt)}` : ""}`
        : null}
      {status === "error" ? (
        <>
          <span>⚠️ Save failed. Retrying...</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </>
      ) : null}
    </p>
  );
}

/**
 * The learner's essay answer: text with a live KaTeX preview and (when an
 * `onUpload` is provided and the question allows files) an upload zone.
 * Every change is auto-saved as a draft after a 1.5 s pause. It starts from
 * `initial`, the draft the server returned, so a reload resumes seamlessly.
 */
export function EssayAnswerInput({
  config,
  initial,
  initialSavedAt,
  onSave,
  onUpload,
  onChange,
  disabled = false,
  delay,
  flushRef,
}: {
  config?: AttemptQuestion["essayConfig"];
  initial?: EssayAnswerValue | null;
  initialSavedAt?: string | null;
  onSave: (answer: EssayAnswerValue) => Promise<unknown>;
  onUpload?: (file: File) => Promise<EssayAttachment>;
  onChange?: (answer: EssayAnswerValue) => void;
  disabled?: boolean;
  delay?: number;
  // Lets the parent send any unsaved change before submitting.
  flushRef?: { current: (() => Promise<void>) | null };
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [attachments, setAttachments] = useState<EssayAttachment[]>(
    initial?.attachments ?? [],
  );
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textId = useId();

  const textAllowed =
    !config || config.allowedSubmissionTypes.includes("TEXT_WITH_KATEX");
  const filesAllowed =
    Boolean(onUpload) &&
    Boolean(config?.allowedSubmissionTypes.includes("FILE_UPLOAD"));
  const maxFiles = config?.maxFileUploads ?? 3;

  const value: EssayAnswerValue = {
    ...(textAllowed && { text }),
    ...(attachments.length > 0 && { attachments }),
  };
  const { status, savedAt, flush, retry } = useAutoSaveAnswer({
    value,
    save: onSave,
    delay,
    enabled: !disabled,
    initialSavedAt: initialSavedAt ? new Date(initialSavedAt) : null,
  });

  useEffect(() => {
    onChange?.({
      ...(textAllowed && { text }),
      ...(attachments.length > 0 && { attachments }),
    });
    // Report only real edits, not a new `onChange` identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, attachments, textAllowed]);
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, flush]);

  async function addFiles(files: FileList | File[]) {
    if (!onUpload || disabled) return;
    setUploadError(null);
    const room = maxFiles - attachments.length - uploading;
    const chosen = [...files].slice(0, Math.max(0, room));
    if (chosen.length < files.length)
      setUploadError(`Tối đa ${maxFiles} tệp đính kèm.`);
    setUploading((count) => count + chosen.length);
    await Promise.all(
      chosen.map(async (file) => {
        try {
          const uploaded = await onUpload(file);
          setAttachments((list) => [...list, uploaded]);
        } catch (error) {
          setUploadError(
            `Không tải được ${file.name}. ${
              error instanceof ApiError
                ? errorMessage(error)
                : error instanceof Error && error.message
                  ? error.message
                  : errorMessage(error)
            }`,
          );
        } finally {
          setUploading((count) => count - 1);
        }
      }),
    );
  }

  const words = wordCount(text);
  return (
    <div className="space-y-3">
      {textAllowed ? (
        <div>
          <label htmlFor={textId} className="sr-only">
            Câu trả lời tự luận
          </label>
          <Textarea
            id={textId}
            value={text}
            disabled={disabled}
            maxLength={100_000}
            placeholder="Nhập câu trả lời. Dùng $...$ cho công thức, ví dụ $E = mc^2$."
            className="!min-h-48"
            onChange={(event) => setText(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted" data-testid="essay-word-count">
            {words} từ
            {config?.maxWords ? ` / tối đa ${config.maxWords}` : ""}
          </p>
          {text.includes("$") ? (
            <div
              className="mt-3 rounded-md border border-border bg-surface-secondary p-3"
              aria-label="Xem trước công thức"
            >
              <KatexText text={text} />
            </div>
          ) : null}
        </div>
      ) : null}

      {filesAllowed ? (
        <div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
            className={`flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center text-sm ${
              dragging ? "border-primary bg-secondary" : "border-border-strong"
            }`}
          >
            <Upload aria-hidden size={20} />
            <p>Kéo thả ảnh bài làm nháp vào đây hoặc</p>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || attachments.length + uploading >= maxFiles}
              onClick={() => input.current?.click()}
            >
              Chọn tệp
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept="image/*,application/pdf"
              data-testid="essay-file-input"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <p className="text-xs text-muted">
              Tối đa {maxFiles} tệp ({attachments.length}/{maxFiles})
            </p>
          </div>
          {uploadError ? (
            <p role="alert" className="mt-2 text-xs text-danger-foreground">
              {uploadError}
            </p>
          ) : null}
          <ul className="mt-2 space-y-1">
            {attachments.map((file) => (
              <li
                key={file.url}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <FileText aria-hidden size={15} />
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate underline"
                >
                  {file.filename}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Xóa ${file.filename}`}
                  onClick={() =>
                    setAttachments((list) =>
                      list.filter((item) => item.url !== file.url),
                    )
                  }
                >
                  <X aria-hidden size={14} />
                </Button>
              </li>
            ))}
            {uploading > 0 ? (
              <li className="flex items-center gap-2 text-xs text-muted">
                <Loader2 aria-hidden size={14} className="animate-spin" />
                Đang tải lên…
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <SaveIndicator status={status} savedAt={savedAt} onRetry={retry} />
    </div>
  );
}
