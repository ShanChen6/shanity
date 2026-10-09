"use client";
import { useId, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FORMAT_LABEL,
  acceptOf,
  fileProblem,
  formatOf,
  type ImportFormat,
} from "./api";

const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Click-or-drop file picker for one import file. Rejects wrong extensions and
 * oversized files before anything is uploaded.
 */
export function FileDropzone({
  formats,
  file,
  disabled,
  onChange,
}: {
  formats: ImportFormat[];
  file: File | null;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const hintId = useId();

  const pick = (next: File | undefined) => {
    if (!next) return;
    const issue = fileProblem(next, formats);
    setProblem(issue);
    onChange(issue ? null : next);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) pick(event.dataTransfer.files[0]);
  };
  const format = file ? formatOf(file) : null;
  const FileIcon = format === "xlsx" ? FileSpreadsheet : FileText;

  return (
    <div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept={acceptOf(formats)}
        disabled={disabled}
        aria-describedby={hintId}
        aria-label="Chọn file import"
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-hover p-3">
          <FileIcon aria-hidden size={28} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted">
              {format ? FORMAT_LABEL[format] : ""} · {formatSize(file.size)}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-surface-active hover:text-foreground disabled:opacity-50"
            aria-label="Bỏ chọn file"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X aria-hidden size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            dragging
              ? "border-primary bg-secondary"
              : "border-border-strong hover:bg-surface-hover",
          )}
        >
          <Upload aria-hidden size={24} className="text-primary" />
          <span className="font-medium">
            Kéo thả file vào đây hoặc bấm để chọn
          </span>
        </button>
      )}
      <p id={hintId} className="mt-2 text-xs text-muted">
        Hỗ trợ {acceptOf(formats).replaceAll(",", ", ")} · tối đa 5 MB
      </p>
      {problem ? (
        <p role="alert" className="mt-1 text-sm text-danger-foreground">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
