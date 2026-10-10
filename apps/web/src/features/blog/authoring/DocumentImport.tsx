"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/providers/toast-provider";
import { IMPORT_ACCEPT, blogErrorMessage, importDocument, type ImportedDraft } from "./api";

const FORMAT_LABELS: Record<ImportedDraft["format"], string> = {
  docx: "Word",
  markdown: "Markdown",
  text: "văn bản",
  xlsx: "Excel",
  pdf: "PDF",
};

/**
 * "Nhập từ tài liệu": a Word, Markdown, text, Excel or PDF file becomes the
 * post body, for the author to review. When the post already has content
 * the author chooses to replace it or add the document after it.
 */
export function DocumentImport({
  hasContent,
  disabled,
  onImport,
}: {
  hasContent: boolean;
  disabled?: boolean;
  onImport: (draft: ImportedDraft, mode: "replace" | "append") => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const toasts = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ImportedDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const finish = (draft: ImportedDraft, mode: "replace" | "append") => {
    onImport(draft, mode);
    setPending(null);
    setWarnings(draft.warnings);
    toasts.success(`Đã nhập nội dung từ file ${FORMAT_LABELS[draft.format]}. Hãy xem lại trước khi lưu.`);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setWarnings([]);
    try {
      const draft = await importDocument(file);
      if (hasContent) setPending(draft);
      else finish(draft, "replace");
    } catch (error) {
      toasts.error(blogErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        loading={busy}
        loadingLabel="Đang đọc tài liệu…"
        onClick={() => input.current?.click()}
        title="Word (.docx), Markdown (.md), văn bản (.txt), Excel (.xlsx) hoặc PDF, tối đa 20 MB"
      >
        <FileUp aria-hidden className="size-4" /> Nhập từ tài liệu
      </Button>
      <input
        ref={input}
        type="file"
        accept={IMPORT_ACCEPT}
        hidden
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {warnings.length > 0 && (
        <Alert tone="warning" title="Một số phần của tài liệu chưa chuyển được" className="basis-full">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setWarnings([])}>
            Đã hiểu
          </button>
        </Alert>
      )}
      {pending && (
        <Dialog
          title="Bài đã có nội dung"
          description="Bạn muốn thay nội dung hiện tại bằng tài liệu vừa nhập, hay thêm tài liệu vào cuối bài?"
          onClose={() => setPending(null)}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Hủy
            </Button>
            <Button variant="outline" onClick={() => finish(pending, "append")}>
              Thêm vào cuối
            </Button>
            <Button variant="danger" onClick={() => finish(pending, "replace")}>
              Thay nội dung
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
