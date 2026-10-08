"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FileText, Sigma, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { ApiError, errorMessage } from "@/lib/api";
import type { AttemptQuestion, EssayAnswerValue, EssayAttachment } from "./api";
import { KatexText } from "./KatexText";
import { readLocalDraft } from "./local-draft";
import { useAutoSaveAnswer, type AutoSaveStatus } from "./useAutoSaveAnswer";

export const wordCount = (text: string) =>
  text.trim() ? text.trim().split(/\s+/u).length : 0;

/** True when the answer holds text or at least one attachment. */
export const hasEssayContent = (answer?: EssayAnswerValue | null) =>
  Boolean(answer?.text?.trim() || answer?.attachments?.length);

/** "just now", "12s ago", "3m ago", "2h ago". */
export function relativeTime(from: Date, now: number): string {
  const seconds = Math.max(0, Math.floor((now - from.getTime()) / 1000));
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const TONE: Record<AutoSaveStatus, string> = {
  idle: "text-muted",
  dirty: "text-muted",
  syncing: "text-warning-foreground",
  success: "text-success-foreground",
  offline: "text-danger-foreground",
  error: "text-danger-foreground",
};

/**
 * The corner status bar of an essay: Autosaved Ns ago (green), Saving...
 * (yellow), Offline - Saved locally (red), plus the failure with a Retry.
 */
export function SaveIndicator({
  status,
  savedAt,
  onRetry,
}: {
  status: AutoSaveStatus;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  // Re-render every second while the "ago" text is on screen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "success") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status, savedAt]);

  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="essay-save-status"
      data-status={status}
      className={`flex min-h-5 flex-wrap items-center gap-2 text-xs font-medium ${TONE[status]}`}
    >
      {status === "dirty" ? "Unsaved changes..." : null}
      {status === "syncing" ? "Saving..." : null}
      {status === "success"
        ? `✓ Autosaved ${savedAt ? relativeTime(savedAt, now) : ""}`.trim()
        : null}
      {status === "offline" ? "Offline - Saved locally" : null}
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

type Upload = { id: string; name: string; progress: number };

const toValue = (
  textAllowed: boolean,
  text: string,
  attachments: EssayAttachment[],
): EssayAnswerValue => ({
  ...(textAllowed && { text }),
  ...(attachments.length > 0 && { attachments }),
});

/**
 * The learner's essay answer: text with a LaTeX toolbar and live KaTeX
 * preview, and (when an `onUpload` is provided and the question allows files)
 * an upload zone with per-file progress. Every change is auto-saved as a draft
 * after a 1.5 s pause. It starts from `initial`, the draft the server
 * returned, so a reload resumes seamlessly.
 *
 * With a `draftKey`, anything the server has not confirmed is also kept in
 * localStorage: a lost connection shows "Offline - Saved locally", nothing is
 * dropped, and the text is restored (and sent) after a reload or reconnect.
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
  draftKey,
}: {
  config?: AttemptQuestion["essayConfig"];
  initial?: EssayAnswerValue | null;
  initialSavedAt?: string | null;
  onSave: (answer: EssayAnswerValue) => Promise<unknown>;
  onUpload?: (
    file: File,
    onProgress: (percent: number) => void,
  ) => Promise<EssayAttachment>;
  onChange?: (answer: EssayAnswerValue) => void;
  disabled?: boolean;
  delay?: number;
  // Lets the parent send any unsaved change before submitting.
  flushRef?: { current: (() => Promise<void>) | null };
  // Where the unsynced draft is mirrored on this device.
  draftKey?: string;
}) {
  const textAllowed =
    !config || config.allowedSubmissionTypes.includes("TEXT_WITH_KATEX");
  const filesAllowed =
    Boolean(onUpload) &&
    Boolean(config?.allowedSubmissionTypes.includes("FILE_UPLOAD"));
  const maxFiles = config?.maxFileUploads ?? 3;

  // What the server holds, and (if newer on this device) what to start from.
  const [server] = useState(() =>
    toValue(textAllowed, initial?.text ?? "", initial?.attachments ?? []),
  );
  const [restored] = useState(() => {
    const local = draftKey
      ? readLocalDraft<EssayAnswerValue>(draftKey)
      : null;
    return local && JSON.stringify(local.value) !== JSON.stringify(server)
      ? local.value
      : null;
  });
  const start = restored ?? server;

  const [text, setText] = useState(start.text ?? "");
  const [attachments, setAttachments] = useState<EssayAttachment[]>(
    start.attachments ?? [],
  );
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(() =>
    restored
      ? {
          tone: "info",
          message: "Đã khôi phục bản nháp chưa đồng bộ từ thiết bị này.",
        }
      : null,
  );
  const closeToast = useCallback(() => setToast(null), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const textId = useId();

  const value = toValue(textAllowed, text, attachments);
  const { status, savedAt, flush, retry, online } = useAutoSaveAnswer({
    value,
    baseline: server,
    save: onSave,
    delay,
    enabled: !disabled,
    initialSavedAt: initialSavedAt ? new Date(initialSavedAt) : null,
    storageKey: draftKey,
  });

  // Tell the learner when the connection drops and returns.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (wasOnline.current === online) return;
    wasOnline.current = online;
    setToast(
      online
        ? {
            tone: "info",
            message: "Đã kết nối lại. Đang đồng bộ bài làm của bạn…",
          }
        : {
            tone: "error",
            message:
              "Mất kết nối mạng. Bài làm được lưu trên thiết bị này và sẽ tự đồng bộ khi có mạng.",
          },
    );
  }, [online]);
  useEffect(() => {
    onChange?.(toValue(textAllowed, text, attachments));
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

  /** Wraps the selection (or a placeholder) in LaTeX delimiters. */
  function wrap(before: string, after: string, placeholder: string) {
    const element = area.current;
    const from = element?.selectionStart ?? text.length;
    const to = element?.selectionEnd ?? text.length;
    const selected = text.slice(from, to) || placeholder;
    setText(`${text.slice(0, from)}${before}${selected}${after}${text.slice(to)}`);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(
        from + before.length,
        from + before.length + selected.length,
      );
    });
  }

  async function addFiles(files: FileList | File[]) {
    if (!onUpload || disabled) return;
    setUploadError(null);
    const room = maxFiles - attachments.length - uploads.length;
    const chosen = [...files].slice(0, Math.max(0, room));
    if (chosen.length < files.length)
      setUploadError(`Tối đa ${maxFiles} tệp đính kèm.`);
    await Promise.all(
      chosen.map(async (file) => {
        const id = `${file.name}-${Math.random().toString(36).slice(2)}`;
        setUploads((list) => [...list, { id, name: file.name, progress: 0 }]);
        try {
          const uploaded = await onUpload(file, (progress) =>
            setUploads((list) =>
              list.map((item) =>
                item.id === id ? { ...item, progress } : item,
              ),
            ),
          );
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
          setUploads((list) => list.filter((item) => item.id !== id));
        }
      }),
    );
  }

  const words = wordCount(text);
  return (
    <div className="space-y-3">
      {textAllowed ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label htmlFor={textId} className="sr-only">
              Câu trả lời tự luận
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => wrap("$", "$", "x^2")}
              aria-label="Chèn công thức nội dòng"
            >
              <Sigma aria-hidden size={14} className="mr-1" /> $ … $
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => wrap("\n$$\n", "\n$$\n", "\\frac{a}{b}")}
              aria-label="Chèn công thức khối"
            >
              <Sigma aria-hidden size={14} className="mr-1" /> $$ … $$
            </Button>
          </div>
          <div
            className={
              text.includes("$") ? "grid gap-3 md:grid-cols-2" : "grid gap-3"
            }
          >
            <div>
              <Textarea
                ref={area}
                id={textId}
                value={text}
                disabled={disabled}
                maxLength={100_000}
                placeholder="Nhập câu trả lời. Dùng $...$ cho công thức, ví dụ $E = mc^2$."
                className="!min-h-48"
                onChange={(event) => setText(event.target.value)}
              />
              <p
                className="mt-1 text-xs text-muted"
                data-testid="essay-word-count"
              >
                {words} từ
                {config?.maxWords ? ` / tối đa ${config.maxWords}` : ""}
              </p>
            </div>
            {text.includes("$") ? (
              <div
                className="min-h-24 rounded-md border border-border bg-surface-secondary p-3"
                aria-label="Xem trước công thức"
              >
                <KatexText text={text} />
              </div>
            ) : null}
          </div>
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
              disabled={
                disabled ||
                !online ||
                attachments.length + uploads.length >= maxFiles
              }
              onClick={() => fileInput.current?.click()}
            >
              Chọn tệp
            </Button>
            <input
              ref={fileInput}
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
              {online ? "" : " · cần có mạng để tải ảnh lên"}
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
            {uploads.map((upload) => (
              <li
                key={upload.id}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                <div className="mb-1 flex justify-between gap-2">
                  <span className="min-w-0 truncate">{upload.name}</span>
                  <span className="tabular-nums">{upload.progress}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Đang tải ${upload.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={upload.progress}
                  className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"
                >
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SaveIndicator status={status} savedAt={savedAt} onRetry={retry} />
      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onClose={closeToast} />
      ) : null}
    </div>
  );
}

export type EssayFlushRef = RefObject<(() => Promise<void>) | null>;
