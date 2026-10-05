export const LESSON_TYPES = ["TEXT", "VIDEO", "DOCUMENT"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

// Mirrors the Lesson entity returned by the lessons API (bigint columns arrive as strings).
export type ApiLesson = {
  id: string;
  courseId: string;
  chapterId: string;
  title: string;
  slug: string;
  type: LessonType;
  position: number;
  isPreview: boolean;
  isPublished: boolean;
  textBody: string | null;
  videoAssetId: string | null;
  videoExternalUrl: string | null;
  videoProvider: "YOUTUBE" | "VIMEO" | "LOCAL" | null;
  videoDurationSeconds: number | null;
  videoFileSize: string | null;
  videoMimeType: string | null;
  documentAssetId: string | null;
  documentFileName: string | null;
  documentFileSize: string | null;
  documentMimeType: string | null;
  documentFileType: string | null;
  documentDownloadAllowed: boolean | null;
};

export const TYPE_LABEL: Record<LessonType, string> = {
  TEXT: "Text",
  VIDEO: "Video",
  DOCUMENT: "Document",
};

export const TYPE_ICON: Record<LessonType, string> = {
  TEXT: "▤",
  VIDEO: "▷",
  DOCUMENT: "▣",
};

export const VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"];
export const DOCUMENT_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/plain",
  "text/markdown",
];
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export function formatBytes(value: number | string | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const scaled = bytes / 1024 ** exponent;
  return `${scaled >= 10 || exponent === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[exponent]}`;
}
