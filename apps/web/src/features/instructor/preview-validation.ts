import type { Lesson } from "./data";

export function isLessonContentValid(
  lesson: Pick<
    Lesson,
    "contentType" | "body" | "videoUrl" | "videoAssetId" | "documentAssetId"
  >,
) {
  if (lesson.contentType === "TEXT") return !!lesson.body?.trim();
  if (lesson.contentType === "VIDEO")
    return !!lesson.videoUrl?.trim() || !!lesson.videoAssetId?.trim();
  return !!lesson.documentAssetId?.trim();
}
