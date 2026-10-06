import { z } from "zod";
import {
  DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME,
  type LessonType,
} from "./types";

const providerHost = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

// Matches the backend rule: https only, YouTube or Vimeo.
export function isSupportedVideoUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (providerHost(host, "youtube.com") ||
        providerHost(host, "youtu.be") ||
        providerHost(host, "vimeo.com"))
    );
  } catch {
    return false;
  }
}

const fileSchema = z.custom<File | null>(
  (value) => value === null || value instanceof File,
);

const fields = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Nhập tiêu đề bài học.")
    .max(255, "Tiêu đề tối đa 255 ký tự."),
  isPreview: z.boolean(),
  isRequired: z.boolean(),
  textBody: z.string(),
  source: z.enum(["url", "upload"]),
  videoUrl: z.string(),
  file: fileSchema,
  allowDownload: z.boolean(),
});

export type LessonFormValues = z.infer<typeof fields>;

export function lessonFormSchema(
  type: LessonType,
  options: { hasStoredFile?: boolean } = {},
) {
  return fields.superRefine((values, ctx) => {
    const issue = (path: keyof LessonFormValues, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (type === "TEXT") {
      if (!values.textBody.trim()) issue("textBody", "Nhập nội dung bài học.");
      else if (values.textBody.length > 1_000_000)
        issue("textBody", "Nội dung tối đa 1.000.000 ký tự.");
    }
    if (type === "VIDEO") {
      if (values.source === "url") {
        const url = values.videoUrl.trim();
        if (!url) issue("videoUrl", "Nhập URL video.");
        else if (url.length > 2048) issue("videoUrl", "URL tối đa 2048 ký tự.");
        else if (!isSupportedVideoUrl(url))
          issue("videoUrl", "Chỉ hỗ trợ liên kết https YouTube hoặc Vimeo.");
      } else if (!values.file) {
        if (!options.hasStoredFile) issue("file", "Chọn tệp video để tải lên.");
      } else if (!VIDEO_MIME.includes(values.file.type))
        issue("file", "Video phải là MP4, WebM hoặc MOV.");
      else if (values.file.size > MAX_VIDEO_BYTES)
        issue("file", "Video tối đa 2 GB.");
    }
    if (type === "DOCUMENT") {
      if (!values.file) {
        if (!options.hasStoredFile) issue("file", "Chọn tệp tài liệu.");
      } else if (!values.file.size) issue("file", "Tệp tài liệu đang trống.");
      else if (values.file.size > MAX_DOCUMENT_BYTES)
        issue("file", "Tài liệu tối đa 50 MB.");
      else if (!DOCUMENT_MIME.includes(values.file.type))
        issue("file", "Chấp nhận PDF, DOCX, PPTX, ZIP, TXT hoặc MD.");
    }
  });
}

export function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0111/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200) || "lesson"
  );
}
