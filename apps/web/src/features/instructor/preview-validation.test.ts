import { describe, expect, it } from "vitest";
import { isLessonContentValid } from "./preview-validation";

const empty = {
  body: "",
  videoUrl: null,
  videoAssetId: null,
  documentAssetId: null,
};

describe("publish checklist lesson content", () => {
  it.each([
    [{ ...empty, contentType: "TEXT" as const, body: "Lesson text" }],
    [
      {
        ...empty,
        contentType: "VIDEO" as const,
        videoUrl: "https://example.com/video",
      },
    ],
    [
      {
        ...empty,
        contentType: "VIDEO" as const,
        videoAssetId: "videos/lesson.mp4",
      },
    ],
    [
      {
        ...empty,
        contentType: "DOCUMENT" as const,
        documentAssetId: "documents/slides.pdf",
      },
    ],
  ])("accepts a lesson with valid typed content", (lesson) => {
    expect(isLessonContentValid(lesson)).toBe(true);
  });

  it.each(["TEXT", "VIDEO", "DOCUMENT"] as const)(
    "rejects an empty %s lesson",
    (contentType) => {
      expect(isLessonContentValid({ ...empty, contentType })).toBe(false);
    },
  );
});
