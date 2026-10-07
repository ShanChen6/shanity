"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatFileSize } from "./validation";

export type ChosenProof = { file: File; proofImageUrl: string };

function Thumb({ file }: { file: File }) {
  const [url] = useState(() =>
    file.type.startsWith("image/") && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : null,
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img
      src={url}
      alt="Xem trước chứng từ"
      className="size-14 shrink-0 rounded-md border border-border object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-14 shrink-0 place-items-center rounded-md border border-border bg-surface-secondary text-xs font-semibold"
    >
      PDF
    </span>
  );
}

/** Uploads on selection; the returned URL (not the file) goes in the form. */
export function ProofField({
  proof,
  uploading,
  error,
  disabled,
  onSelect,
  onClear,
}: {
  proof: ChosenProof | null;
  uploading: boolean;
  error: string;
  disabled: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Chứng từ chuyển khoản (bắt buộc)</Label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        disabled={disabled || uploading}
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onSelect(file);
        }}
        className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-transparent file:px-4 file:py-2 file:text-sm file:font-semibold disabled:opacity-60"
      />
      <p id={`${id}-hint`} className="text-caption text-muted">
        Ảnh PNG, JPG, WebP hoặc PDF, tối đa 5 MB. Tệp được tải lên ngay khi
        chọn.
      </p>
      {uploading && (
        <p role="status" className="text-sm text-muted">
          Đang tải chứng từ lên…
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
      {proof && (
        <div className="flex items-center gap-3 rounded-md border border-border p-2">
          <Thumb key={proof.proofImageUrl} file={proof.file} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{proof.file.name}</p>
            <p className="text-xs text-success-foreground">
              Đã tải lên · {formatFileSize(proof.file.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onClear}
          >
            Gỡ
          </Button>
        </div>
      )}
    </div>
  );
}
