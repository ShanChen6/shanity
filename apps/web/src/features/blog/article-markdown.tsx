import type { ComponentPropsWithoutRef, ReactNode } from "react";
import katex from "katex";
// Chemistry: \ce{2H2 + O2 -> 2H2O}, \pu{9.8 m/s^2}. Registers on this katex.
import "katex/contrib/mhchem";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { SITE_URL } from "@/config/site.config";
import { cn } from "@/lib/utils";

/** Text of a React subtree, for heading anchors. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node)
    return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/** "Hàm bậc 2" -> "ham-bac-2", for #anchors (đ handled like the API). */
export function anchorId(text: string) {
  return (
    text
      .replace(/[đĐ]/g, "d")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "muc"
  );
}

/**
 * A line holding only `$$...$$` is display math, as authors (and the quiz
 * player) expect; remark-math wants the `$$` on lines of their own for
 * that. Fenced code is left alone (`$$` is the shell's PID).
 */
export function normalizeDisplayMath(markdown: string) {
  return markdown
    .split(/(^(?:```|~~~)[\s\S]*?^(?:```|~~~)[^\n]*$)/m)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/^[ \t]*\$\$(.+?)\$\$[ \t]*$/gm, "$$$$\n$1\n$$$$"),
    )
    .join("");
}

/** Links leaving the site: new tab, and no endorsement for search engines. */
export function isExternal(href: string | undefined) {
  if (!href || href.startsWith("#") || href.startsWith("/")) return false;
  try {
    return new URL(href).origin !== new URL(SITE_URL).origin;
  } catch {
    return false;
  }
}

/**
 * KaTeX HTML for one formula. Rendered with the app's own katex (not
 * rehype-katex's bundled copy) so the mhchem extension applies. KaTeX
 * output is markup it generates itself; `trust` stays off, so \href,
 * \includegraphics and raw HTML commands are not honoured. A formula with
 * an error renders in red instead of breaking the article.
 */
export function renderMath(tex: string, displayMode: boolean) {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: false,
    trust: false,
    maxExpand: 1000,
  });
}

const isMath = (className: unknown, kind: "inline" | "display") =>
  typeof className === "string" && className.split(" ").includes(`math-${kind}`);

/** remark-math hands formulas over as `code.math-inline` / `pre > code.math-display`. */
function mathSource(children: ReactNode) {
  return textOf(children).replace(/\n$/, "");
}

/** react-markdown passes its AST `node`; it is not a DOM attribute. */
function domProps<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const copy = { ...props };
  delete copy.node;
  return copy;
}

const heading = (Tag: "h2" | "h3" | "h4", className: string) => {
  function Heading(
    props: ComponentPropsWithoutRef<"h2"> & { node?: unknown },
  ) {
    return (
      <Tag
        {...domProps(props)}
        id={anchorId(textOf(props.children))}
        className={cn("scroll-mt-24 font-heading font-semibold", className)}
      />
    );
  }
  return Heading;
};

// Tailwind's reset leaves Markdown bare; the article sets its own rhythm.
const components: Components = {
  // One <h1> per page (the title): Markdown "#" becomes a section heading.
  h1: heading("h2", "mt-10 mb-4 text-h2"),
  h2: heading("h2", "mt-10 mb-4 text-h2"),
  h3: heading("h3", "mt-8 mb-3 text-h3"),
  h4: heading("h4", "mt-6 mb-2 text-h4"),
  p: (props) => <p {...domProps(props)} className="my-5" />,
  a: ({ href, children, ...props }) =>
    isExternal(href) ? (
      <a
        {...domProps(props)}
        href={href}
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4"
      >
        {children}
      </a>
    ) : (
      <a
        {...domProps(props)}
        href={href}
        className="font-medium text-primary underline underline-offset-4"
      >
        {children}
      </a>
    ),
  ul: (props) => (
    <ul {...domProps(props)} className="my-5 list-disc space-y-2 pl-6" />
  ),
  ol: (props) => (
    <ol {...domProps(props)} className="my-5 list-decimal space-y-2 pl-6" />
  ),
  blockquote: (props) => (
    <blockquote
      {...domProps(props)}
      className="my-6 border-l-4 border-primary/50 bg-surface-secondary px-5 py-3 italic text-foreground-secondary"
    />
  ),
  pre: (props) => {
    const child = Array.isArray(props.children) ? props.children[0] : props.children;
    const childProps =
      child && typeof child === "object" && "props" in child
        ? (child.props as { className?: string; children?: ReactNode })
        : null;
    if (childProps && isMath(childProps.className, "display"))
      return (
        <div
          className="math-display"
          dangerouslySetInnerHTML={{ __html: renderMath(mathSource(childProps.children), true) }}
        />
      );
    return (
      <pre
        {...domProps(props)}
        className="my-6 overflow-x-auto rounded-lg border border-border bg-surface-secondary p-4 font-mono text-code"
      />
    );
  },
  code: ({ className, ...props }) =>
    isMath(className, "inline") ? (
      <span
        className="math-inline"
        dangerouslySetInnerHTML={{ __html: renderMath(mathSource(props.children), false) }}
      />
    ) : (
    <code
      {...domProps(props)}
      className={cn(
        // Inline code gets a chip; fenced code (language-*) sits in <pre>.
        !className && "rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[0.9em]",
        className,
      )}
    />
    ),
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element -- author images from any host, sized by CSS
    <img
      {...domProps(props)}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className="my-6 h-auto max-w-full rounded-lg"
    />
  ),
  table: (props) => (
    <div className="my-6 overflow-x-auto">
      <table {...domProps(props)} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: (props) => (
    <th
      {...domProps(props)}
      className="border border-border bg-surface-secondary px-3 py-2 text-left font-semibold"
    />
  ),
  td: (props) => (
    <td {...domProps(props)} className="border border-border px-3 py-2" />
  ),
  hr: () => <hr className="my-10 border-border" />,
};

/**
 * A post body: GitHub-flavoured Markdown with $inline$ and $$display$$
 * math. Rendered on the server, so readers and crawlers get the final HTML.
 * Raw HTML in the Markdown is not rendered (react-markdown's default), and
 * unsafe link protocols are dropped, so authors cannot inject script.
 */
export function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className="text-body-lg leading-relaxed text-foreground [&_.katex-display]:my-6 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        components={components}
      >
        {normalizeDisplayMath(content)}
      </ReactMarkdown>
    </div>
  );
}
