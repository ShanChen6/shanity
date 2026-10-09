"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
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

// Nearest scrolling ancestor; the learning shell scrolls <main>, not the window.
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

// Share of the lesson body that has scrolled into view (100 when it all fits).
export function readPercentage(content: DOMRect, viewportBottom: number) {
  if (content.height <= 0) return 100;
  const seen = ((viewportBottom - content.top) / content.height) * 100;
  return Math.round(Math.min(100, Math.max(0, seen)));
}

const READ_THRESHOLD = 80;

export const TextLessonRenderer = memo(function TextLessonRenderer({
  lesson,
  onEvidence,
}: LessonRendererProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    reported.current = false;
    const container = scrollParent(body);
    const target: HTMLElement | Window = container ?? window;
    let max = 0;
    const measure = () => {
      const viewportBottom = container
        ? container.getBoundingClientRect().bottom
        : window.innerHeight;
      max = Math.max(
        max,
        readPercentage(body.getBoundingClientRect(), viewportBottom),
      );
      if (max >= READ_THRESHOLD && !reported.current) {
        reported.current = true;
        onEvidence?.({ scrollPercentage: max });
      }
    };
    measure();
    target.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      target.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [lesson.id, onEvidence]);
  const content = useMemo(() => parseContent(lesson.content), [lesson.content]);
  if (typeof content !== "string")
    return (
      <div ref={bodyRef} data-testid="text-lesson-renderer">
        <div className="prose max-w-none dark:prose-invert">
          {content.blocks.map(renderBlock)}
        </div>
      </div>
    );
  if (!/<[a-z][\s\S]*>/i.test(content))
    return (
      <div ref={bodyRef} data-testid="text-lesson-renderer">
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
                  className={cn(
                    "rounded bg-surface px-1 font-mono",
                    className,
                  )}
                >
                  {children}
                </code>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "applet"],
    FORBID_ATTR: ["style"],
  });
  return (
    <div ref={bodyRef} data-testid="text-lesson-renderer">
      <div
        className="prose max-w-none dark:prose-invert text-lesson-content"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
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
