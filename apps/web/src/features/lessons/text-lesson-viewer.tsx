"use client";

import { useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "strong", "em", "ul", "ol", "li",
  "code", "pre", "blockquote", "a", "img",
];

export function TextLessonViewer({ content }: { content: string }) {
  const sanitized = useMemo(
    () => DOMPurify.sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt"],
      FORBID_TAGS: ["script", "iframe", "object", "embed", "applet"],
      FORBID_ATTR: ["style"],
    }),
    [content],
  );

  return (
    <div
      className="text-lesson-content"
      // Content passes the API allowlist and DOMPurify again at the HTML sink.
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
