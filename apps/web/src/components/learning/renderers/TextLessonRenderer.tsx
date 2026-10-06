"use client";

import { memo, useEffect, useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorBlock, EditorContent, LessonRendererProps } from "./types";

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "code",
  "pre",
  "blockquote",
  "a",
  "img",
];

export const TextLessonRenderer = memo(function TextLessonRenderer({
  lesson,
  onComplete,
}: LessonRendererProps) {
  const [scrollPercentage, setScrollPercentage] = useState(0);
  useEffect(() => {
    const measure = () => {
      const root = document.documentElement;
      const available = Math.max(1, root.scrollHeight - window.innerHeight);
      setScrollPercentage(Math.min(100, (window.scrollY / available) * 100));
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    return () => window.removeEventListener("scroll", measure);
  }, []);
  const content = useMemo(() => parseContent(lesson.content), [lesson.content]);
  const completion = (
    <button
      type="button"
      disabled={scrollPercentage < 80}
      onClick={() => onComplete?.({ scrollPercentage })}
      className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      Mark as Completed
    </button>
  );
  if (typeof content !== "string")
    return (
      <div data-testid="text-lesson-renderer">
        <div className="prose max-w-none dark:prose-invert">
          {content.blocks.map(renderBlock)}
        </div>
        {completion}
      </div>
    );
  if (!/<[a-z][\s\S]*>/i.test(content))
    return (
      <div data-testid="text-lesson-renderer">
        <div className="prose max-w-none dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ children, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              code: ({ children, className, ...props }) => (
                <code
                  {...props}
                  className={`${className ?? ""} rounded bg-surface px-1 font-mono`}
                >
                  {children}
                </code>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
        {completion}
      </div>
    );
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "applet"],
    FORBID_ATTR: ["style"],
  });
  return (
    <div data-testid="text-lesson-renderer">
      <div
        className="prose max-w-none dark:prose-invert text-lesson-content"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
      {completion}
    </div>
  );
});

function parseContent(
  content: LessonRendererProps["lesson"]["content"],
): string | EditorContent {
  if (typeof content !== "string")
    return content && Array.isArray(content.blocks) ? content : { blocks: [] };
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<EditorContent>;
      if (Array.isArray(parsed.blocks))
        return { blocks: parsed.blocks as EditorBlock[] };
    } catch {
      // A malformed JSON-looking value is rendered as ordinary text/HTML.
    }
  }
  return content;
}

function renderBlock(block: EditorBlock, index: number) {
  const key = block.id ?? `${block.type}-${index}`;
  const text = String(
    block.data.text ?? block.data.code ?? block.data.caption ?? "",
  );
  if (block.type === "header") {
    const level = Math.min(6, Math.max(1, Number(block.data.level) || 2));
    const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
    return <Tag key={key}>{text}</Tag>;
  }
  if (block.type === "code")
    return (
      <pre key={key}>
        <code>{text}</code>
      </pre>
    );
  if (block.type === "quote") return <blockquote key={key}>{text}</blockquote>;
  if (block.type === "list") {
    const items = Array.isArray(block.data.items) ? block.data.items : [];
    const List = block.data.style === "ordered" ? "ol" : "ul";
    return (
      <List key={key}>
        {items.map((item, itemIndex) => (
          <li key={itemIndex}>{String(item)}</li>
        ))}
      </List>
    );
  }
  if (block.type === "image") {
    const file = block.data.file as { url?: unknown } | undefined;
    const url = typeof file?.url === "string" ? file.url : "";
    return /^https:\/\//i.test(url) ? (
      // Editor assets can originate from signed remote URLs with unknown dimensions.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={key} src={url} alt={text} loading="lazy" />
    ) : null;
  }
  return <p key={key}>{text}</p>;
}
