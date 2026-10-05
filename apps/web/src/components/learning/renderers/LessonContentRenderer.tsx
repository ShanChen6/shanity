"use client";

import { memo } from "react";
import { DocumentLessonRenderer } from "./DocumentLessonRenderer";
import { TextLessonRenderer } from "./TextLessonRenderer";
import { VideoLessonRenderer } from "./VideoLessonRenderer";
import type { LessonRendererProps, LessonType } from "./types";

type Renderer = typeof TextLessonRenderer;

const renderers: Record<LessonType, Renderer> = {
  TEXT: TextLessonRenderer,
  VIDEO: VideoLessonRenderer,
  DOCUMENT: DocumentLessonRenderer,
};

export const LessonContentRenderer = memo(function LessonContentRenderer(
  props: LessonRendererProps,
) {
  const Renderer = renderers[props.lesson.type];
  if (!Renderer)
    return (
      <div role="alert" className="rounded-md border border-danger p-6 text-danger">
        Unsupported Lesson Type
      </div>
    );
  return <Renderer {...props} />;
});
