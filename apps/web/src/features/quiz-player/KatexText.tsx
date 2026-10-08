"use client";
import "katex/dist/katex.min.css";
import katex from "katex";

// $$display$$ first, then $inline$ (no newline inside, no empty body).
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

/** Splits text into plain and LaTeX segments. */
export function splitMath(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(MATH)) {
    if (match.index > last)
      segments.push({ kind: "text", value: text.slice(last, match.index) });
    const display = match[1] !== undefined;
    segments.push({ kind: "math", value: (match[1] ?? match[2])!, display });
    last = match.index + match[0].length;
  }
  if (last < text.length)
    segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}

/** Plain text with `$...$` / `$$...$$` rendered by KaTeX (never throws, no trust). */
export function KatexText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm">
      {splitMath(text).map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <span
            key={index}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(segment.value, {
                displayMode: segment.display,
                throwOnError: false,
                trust: false,
              }),
            }}
          />
        ),
      )}
    </div>
  );
}
