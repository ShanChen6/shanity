import { api, ApiError } from "@/lib/api";
import type { ApiLesson } from "@/features/instructor/lesson-builder/types";
import type { ApiQuiz } from "@/features/quiz-builder/model";

export type ImportFormat = "json" | "markdown" | "xlsx";

/** One located problem from a 422 IMPORT_VALIDATION_FAILED response. */
export type ImportIssue = {
  message: string;
  row?: number;
  column?: string;
  line?: number;
  path?: string;
};

export type ImportedQuiz = ApiQuiz & {
  import: { format: ImportFormat; questionCount: number };
};

// Mirrors MAX_IMPORT_BYTES on the API.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, ImportFormat> = {
  json: "json",
  md: "markdown",
  markdown: "markdown",
  xlsx: "xlsx",
};

// Browsers often send "" or text/plain for .md and nothing useful for some
// spreadsheets; the API requires a declared type that matches the extension
// (and then checks the bytes itself), so uploads carry the canonical one.
const MIME: Record<ImportFormat, string> = {
  json: "application/json",
  markdown: "text/markdown",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const FORMAT_LABEL: Record<ImportFormat, string> = {
  json: "JSON",
  markdown: "Markdown",
  xlsx: "Excel",
};

export const acceptOf = (formats: ImportFormat[]) =>
  formats
    .flatMap((format) =>
      format === "markdown" ? [".md", ".markdown"] : [`.${format}`],
    )
    .join(",");

export function formatOf(file: File): ImportFormat | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.name.includes(".") ? (EXTENSIONS[extension] ?? null) : null;
}

/** Client-side pre-check; the server re-validates everything. */
export function fileProblem(file: File, formats: ImportFormat[]) {
  const format = formatOf(file);
  if (!format || !formats.includes(format))
    return `Chỉ hỗ trợ file ${acceptOf(formats).replaceAll(",", ", ")}.`;
  if (!file.size) return "File đang trống.";
  if (file.size > MAX_IMPORT_BYTES) return "File vượt quá giới hạn 5 MB.";
  return null;
}

function uploadForm(file: File, fields: Record<string, string | undefined>) {
  const format = formatOf(file)!;
  const form = new FormData();
  for (const [name, value] of Object.entries(fields))
    if (value?.trim()) form.append(name, value.trim());
  form.append("file", new File([file], file.name, { type: MIME[format] }));
  return form;
}

// Parsing a 1000-row sheet takes longer than an ordinary JSON call.
const IMPORT_TIMEOUT_MS = 60_000;

export const importLesson = (chapterId: string, file: File, title?: string) =>
  api<ApiLesson>("/api/v1/instructor/import/lesson", {
    method: "POST",
    body: uploadForm(file, { chapterId, title }),
    signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
  });

export type QuizImportFields = {
  title?: string;
  scope?: string;
  targetId?: string;
  slug?: string;
};

export const importQuiz = (file: File, fields: QuizImportFields) =>
  api<ImportedQuiz>("/api/v1/instructor/import/quiz", {
    method: "POST",
    body: uploadForm(file, fields),
    signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
  });

export type ImportFailure = {
  message: string;
  issues: ImportIssue[];
  totalIssues: number;
};

/** What to show for a failed import: a summary plus any located issues. */
export function importFailure(error: unknown): ImportFailure {
  if (!(error instanceof ApiError))
    return {
      message: "Có lỗi xảy ra. Vui lòng thử lại.",
      issues: [],
      totalIssues: 0,
    };
  const raw = error.data.errors;
  const issues = Array.isArray(raw)
    ? raw.filter(
        (issue): issue is ImportIssue =>
          typeof (issue as ImportIssue)?.message === "string",
      )
    : [];
  const totalIssues =
    typeof error.data.totalErrors === "number"
      ? error.data.totalErrors
      : issues.length;
  return { message: failureMessage(error, totalIssues), issues, totalIssues };
}

function failureMessage(error: ApiError, totalIssues: number) {
  switch (error.status) {
    case 0:
      return error.message;
    case 400:
      return "Thiếu file hoặc thông tin đi kèm không hợp lệ.";
    case 403:
      return error.code === "TARGET_COURSE_FORBIDDEN"
        ? "Bạn không quản lý khóa học được chọn."
        : "Bạn không có quyền import vào vị trí này.";
    case 409:
      return error.code === "QUIZ_SLUG_TAKEN"
        ? "Slug này đã được dùng cho quiz khác."
        : "Dữ liệu xung đột với nội dung hiện có.";
    case 413:
      return error.code === "IMPORT_FILE_TOO_LARGE_UNCOMPRESSED"
        ? "File Excel giải nén ra quá lớn (tối đa 50 MB). Hãy kiểm tra lại file."
        : "File vượt quá giới hạn 5 MB.";
    case 415:
      return "Định dạng file không hợp lệ: phần mở rộng và nội dung file không khớp.";
    case 422:
      return totalIssues
        ? `File có ${totalIssues} lỗi cần sửa. Không có gì được lưu.`
        : "Nội dung file không hợp lệ.";
    default:
      return error.status >= 500
        ? "Máy chủ đang gặp sự cố. Vui lòng thử lại sau."
        : "Không thể import file. Vui lòng thử lại.";
  }
}

/** "Dòng 5 · Cột D" — the location part of an issue, for a badge. */
export function issueLocation(issue: ImportIssue) {
  const parts: string[] = [];
  if (issue.row !== undefined) parts.push(`Dòng ${issue.row}`);
  if (issue.column) parts.push(`Cột ${issue.column}`);
  if (issue.line !== undefined) parts.push(`Dòng ${issue.line}`);
  if (issue.path) parts.push(issue.path);
  return parts.join(" · ");
}

/** The issue text without the server's English location prefix. */
export function issueText(issue: ImportIssue) {
  const separator = issue.message.indexOf(": ");
  return (issue.row !== undefined ||
    issue.line !== undefined ||
    issue.path ||
    issue.column) &&
    separator >= 0
    ? issue.message.slice(separator + 2)
    : issue.message;
}
