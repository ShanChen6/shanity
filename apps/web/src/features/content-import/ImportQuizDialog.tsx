"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { slugify } from "@/features/instructor/data";
import {
  emptyDraft,
  targetIdOf,
  type QuizDraft,
} from "@/features/quiz-builder/model";
import { TargetSelector } from "@/features/quiz-builder/TargetSelector";
import {
  formatOf,
  importFailure,
  importQuiz,
  type ImportedQuiz,
  type QuizImportFields,
} from "./api";
import { FileDropzone } from "./FileDropzone";
import { ImportIssueList } from "./ImportIssueList";
import { QUIZ_TEMPLATES, TemplateLinks } from "./TemplateLinks";

const EXCEL_COLUMNS: Array<[string, string]> = [
  ["A", "Nội dung câu hỏi (bắt buộc)"],
  ["B", "SINGLE_CHOICE hoặc MULTIPLE_CHOICE (mặc định SINGLE_CHOICE)"],
  ["C", "Điểm, số nguyên > 0 (mặc định 10)"],
  ["D", "Số thứ tự đáp án đúng: 2, hoặc 1,3 cho nhiều đáp án"],
  ["E–H", "Lựa chọn 1–4 (ít nhất 2)"],
  ["I", "Giải thích (tùy chọn)"],
];

/** Problems with the quiz settings typed in the dialog; empty = sendable. */
export function settingsProblem(
  draft: QuizDraft,
  required: boolean,
): string | null {
  const title = draft.title.trim();
  if (required && title.length < 3)
    return "Nhập tiêu đề quiz (ít nhất 3 ký tự).";
  if (title && title.length < 3) return "Tiêu đề cần ít nhất 3 ký tự.";
  if (draft.scope !== "STANDALONE" && !targetIdOf(draft))
    return draft.scope === "LESSON"
      ? "Chọn bài học để gắn quiz."
      : draft.scope === "CHAPTER"
        ? "Chọn chương để gắn quiz."
        : "Chọn khóa học để gắn quiz.";
  return null;
}

/** Form fields sent next to the file; they override the file's own settings. */
export function importFields(draft: QuizDraft): QuizImportFields {
  const title = draft.title.trim();
  const slug =
    slugify(draft.slug) ||
    (draft.scope === "STANDALONE" && title ? slugify(title) : "");
  return {
    title,
    scope: draft.scope,
    targetId: targetIdOf(draft) ?? undefined,
    slug,
  };
}

/**
 * Creates a DRAFT quiz from an Excel, JSON or Markdown file. An Excel sheet
 * only has questions, so title and placement come from this form; JSON and
 * Markdown files carry their own settings, which the form may override.
 */
export function ImportQuizDialog({
  onImported,
  onClose,
}: {
  onImported: (quiz: ImportedQuiz) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<QuizDraft>(() => ({
    ...emptyDraft(),
    scope: "STANDALONE",
  }));
  const [override, setOverride] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const isExcel = file ? formatOf(file) === "xlsx" : false;
  const withSettings = isExcel || override;

  const upload = useMutation({
    mutationFn: () =>
      importQuiz(file!, withSettings ? importFields(draft) : {}),
    onSuccess: onImported,
  });
  const busy = upload.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    const issue = withSettings ? settingsProblem(draft, isExcel) : null;
    setProblem(issue);
    if (!issue) upload.mutate();
  };
  const change = (next: QuizDraft) => {
    setDraft(next);
    setProblem(null);
  };

  return (
    <Dialog
      title="Import quiz từ file"
      description="Tạo quiz nháp từ file Excel (.xlsx), JSON hoặc Markdown."
      onClose={onClose}
      busy={busy}
      className="sm:max-w-3xl"
    >
      <form className="space-y-5" onSubmit={submit} noValidate>
        <FileDropzone
          formats={["xlsx", "json", "markdown"]}
          file={file}
          disabled={busy}
          onChange={(next) => {
            setFile(next);
            setProblem(null);
            upload.reset();
          }}
        />

        <details className="rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Cấu trúc cột trong file Excel
          </summary>
          <table className="mt-3 w-full text-left text-xs">
            <tbody className="divide-y divide-border">
              {EXCEL_COLUMNS.map(([column, meaning]) => (
                <tr key={column}>
                  <th scope="row" className="w-14 py-1.5 font-mono">
                    {column}
                  </th>
                  <td className="py-1.5">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Dòng 1 là tiêu đề cột và được bỏ qua; dòng trống cũng được bỏ qua.
          </p>
        </details>

        {file && !isExcel ? (
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={override}
              disabled={busy}
              onChange={(event) => {
                setOverride(event.target.checked);
                setProblem(null);
              }}
            />
            <span>
              <span className="block font-medium">
                Ghi đè cài đặt trong file
              </span>
              <span className="block text-xs text-muted">
                Mặc định dùng tiêu đề, phạm vi và slug khai báo trong file.
              </span>
            </span>
          </label>
        ) : null}

        {withSettings ? (
          <fieldset className="space-y-4" disabled={busy}>
            <legend className="sr-only">Cài đặt quiz</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block text-sm font-medium">
                Tiêu đề{isExcel ? " *" : ""}
                <Input
                  className="mt-2"
                  value={draft.title}
                  maxLength={255}
                  placeholder={
                    isExcel
                      ? "VD: Kiểm tra JavaScript cơ bản"
                      : "Để trống để dùng tiêu đề trong file"
                  }
                  aria-invalid={
                    problem && isExcel && draft.title.trim().length < 3
                      ? true
                      : undefined
                  }
                  onChange={(event) =>
                    change({ ...draft, title: event.target.value })
                  }
                />
              </label>
              {draft.scope === "STANDALONE" ? (
                <label className="block text-sm font-medium">
                  Slug
                  <Input
                    className="mt-2"
                    value={draft.slug}
                    maxLength={255}
                    placeholder={
                      slugify(draft.title) || "tu-dong-tao-tu-tieu-de"
                    }
                    onChange={(event) =>
                      change({
                        ...draft,
                        slug: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, "-"),
                      })
                    }
                  />
                </label>
              ) : null}
            </div>
            <TargetSelector
              draft={draft}
              locked={false}
              readOnly={busy}
              error={problem ?? undefined}
              onChange={change}
            />
          </fieldset>
        ) : null}

        <Alert tone="info">
          Quiz được tạo ở trạng thái <strong>Bản nháp</strong>. Mọi lỗi trong
          file được báo kèm vị trí dòng/cột và không có gì được lưu cho tới khi
          file hợp lệ.
        </Alert>
        <TemplateLinks templates={QUIZ_TEMPLATES} />

        {upload.error ? (
          <ImportIssueList failure={importFailure(upload.error)} />
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={!file}
            loading={busy}
            loadingLabel="Đang import…"
          >
            Import quiz
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
