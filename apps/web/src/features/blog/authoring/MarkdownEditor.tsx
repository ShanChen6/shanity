"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  PenLine,
  Quote,
  Sigma,
  Table,
  CircleHelp,
} from "lucide-react";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { ArticleMarkdown, renderMath } from "../article-markdown";
import { IMAGE_TYPES, blogErrorMessage, uploadImage } from "./api";
import { SNIPPETS, snippetMarkdown, type Snippet } from "./snippets";

type Mode = "write" | "split" | "preview";
type Edit = { before: string; after?: string; placeholder?: string; block?: boolean };

/**
 * Markdown editor for posts: a toolbar for formatting, a formula picker for
 * math, physics and chemistry (KaTeX + mhchem), image upload by button,
 * paste or drop, a side-by-side live preview and a full-screen mode.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  maxLength,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toasts = useToast();
  const [mode, setMode] = useState<Mode>("split");
  const [fullscreen, setFullscreen] = useState(false);
  const [panel, setPanel] = useState<"formulas" | "help" | null>(null);
  const [uploading, setUploading] = useState(0);
  // Uploads finish after more typing: always edit the latest text.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    if (!fullscreen) return;
    const exit = (event: KeyboardEvent) => event.key === "Escape" && setFullscreen(false);
    document.addEventListener("keydown", exit);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", exit);
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  /** Wraps the selection (or a placeholder) and selects the inserted text. */
  const apply = ({ before, after = "", placeholder = "", block }: Edit) => {
    const element = area.current;
    if (!element || disabled) return;
    if (mode === "preview") setMode("split");
    const text = latest.current;
    const start = element.selectionStart ?? text.length;
    const end = element.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || placeholder;
    // Blocks (headings, lists, $$) start on a line of their own.
    const lead = block && start > 0 && text[start - 1] !== "\n" ? "\n" : "";
    const next = `${text.slice(0, start)}${lead}${before}${selected}${after}${text.slice(end)}`;
    if (next.length > maxLength) {
      toasts.error("Nội dung đã chạm giới hạn độ dài của bài.");
      return;
    }
    latest.current = next;
    onChange(next);
    const from = start + lead.length + before.length;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(from, from + selected.length);
    });
  };

  const insertSnippet = (snippet: Snippet) => {
    const markdown = snippetMarkdown(snippet);
    apply({ before: markdown, placeholder: "" });
    setPanel(null);
  };

  /** Uploads images, holding their place with a marker until each is ready. */
  const upload = async (files: File[]) => {
    const images = files.filter((file) => IMAGE_TYPES.includes(file.type));
    if (!images.length) {
      if (files.length) toasts.error("Chỉ hỗ trợ ảnh JPEG, PNG, WebP hoặc GIF tĩnh.");
      return;
    }
    for (const file of images) {
      const marker = `![Đang tải ảnh ${file.name.replace(/[\[\]]/g, "")}…](#tai-anh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)})`;
      apply({ before: `${marker}\n`, block: true });
      setUploading((count) => count + 1);
      try {
        const image = await uploadImage(file);
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "");
        latest.current = latest.current.replace(marker, `![${alt}](${image.url})`);
        onChange(latest.current);
      } catch (error) {
        latest.current = latest.current.replace(`${marker}\n`, "").replace(marker, "");
        onChange(latest.current);
        toasts.error(blogErrorMessage(error));
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const tools: Array<{ label: string; icon: ReactNode; edit: Edit }> = [
    { label: "Tiêu đề lớn", icon: <Heading2 />, edit: { before: "## ", placeholder: "Tiêu đề mục", block: true } },
    { label: "Tiêu đề nhỏ", icon: <Heading3 />, edit: { before: "### ", placeholder: "Tiêu đề mục nhỏ", block: true } },
    { label: "In đậm", icon: <Bold />, edit: { before: "**", after: "**", placeholder: "chữ đậm" } },
    { label: "In nghiêng", icon: <Italic />, edit: { before: "*", after: "*", placeholder: "chữ nghiêng" } },
    { label: "Danh sách", icon: <List />, edit: { before: "- ", placeholder: "Ý thứ nhất", block: true } },
    { label: "Danh sách đánh số", icon: <ListOrdered />, edit: { before: "1. ", placeholder: "Bước thứ nhất", block: true } },
    { label: "Trích dẫn", icon: <Quote />, edit: { before: "> ", placeholder: "Ghi chú hoặc lưu ý", block: true } },
    { label: "Đoạn code", icon: <Code />, edit: { before: "```\n", after: "\n```\n", placeholder: "code", block: true } },
    { label: "Liên kết", icon: <Link2 />, edit: { before: "[", after: "](https://)", placeholder: "chữ hiển thị" } },
    {
      label: "Bảng",
      icon: <Table />,
      edit: {
        before: "| Cột 1 | Cột 2 |\n| --- | --- |\n| ",
        after: " | |\n",
        placeholder: "Nội dung",
        block: true,
      },
    },
  ];

  const toolButton = "inline-flex size-9 items-center justify-center rounded-md text-foreground-secondary hover:bg-surface-hover hover:text-foreground disabled:opacity-50 [&_svg]:size-4";
  const editorHeight = fullscreen ? "h-full" : "h-[65vh] min-h-[24rem]";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-surface",
        fullscreen && "fixed inset-0 z-50 rounded-none border-0",
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5" role="toolbar" aria-label="Định dạng nội dung">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            className={toolButton}
            disabled={disabled}
            onClick={() => apply(tool.edit)}
          >
            {tool.icon}
          </button>
        ))}
        <button
          type="button"
          title="Chèn ảnh (hoặc dán / kéo thả ảnh vào ô soạn thảo)"
          aria-label="Chèn ảnh"
          className={toolButton}
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          multiple
          hidden
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <button
          type="button"
          aria-expanded={panel === "formulas"}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold hover:bg-surface-hover [&_svg]:size-4",
            panel === "formulas" && "bg-secondary text-secondary-foreground",
          )}
          disabled={disabled}
          onClick={() => setPanel(panel === "formulas" ? null : "formulas")}
        >
          <Sigma /> Công thức
        </button>
        <button
          type="button"
          aria-expanded={panel === "help"}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm hover:bg-surface-hover [&_svg]:size-4",
            panel === "help" && "bg-secondary text-secondary-foreground",
          )}
          onClick={() => setPanel(panel === "help" ? null : "help")}
        >
          <CircleHelp /> Hướng dẫn
        </button>

        <div className="ml-auto flex items-center gap-1">
          <div role="radiogroup" aria-label="Chế độ hiển thị" className="flex rounded-md border border-border p-0.5">
            {(
              [
                ["write", "Soạn thảo", <PenLine key="w" />],
                ["split", "Song song", <Columns2 key="s" />],
                ["preview", "Xem trước", <Eye key="p" />],
              ] as const
            ).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                title={label}
                onClick={() => setMode(value)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold [&_svg]:size-3.5",
                  mode === value ? "bg-secondary text-secondary-foreground" : "text-muted hover:bg-surface-hover",
                )}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            title={fullscreen ? "Thu nhỏ (Esc)" : "Toàn màn hình"}
            aria-label={fullscreen ? "Thu nhỏ" : "Toàn màn hình"}
            className={toolButton}
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </button>
        </div>
      </div>

      {panel === "formulas" && <FormulaPanel onPick={insertSnippet} />}
      {panel === "help" && <HelpPanel />}

      <div
        className={cn(
          "grid min-h-0",
          fullscreen && "flex-1",
          mode === "split" && "lg:grid-cols-2 lg:divide-x lg:divide-border",
        )}
      >
        {mode !== "preview" && (
          <textarea
            ref={area}
            id={id}
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.some((file) => file.type.startsWith("image/"))) {
                event.preventDefault();
                void upload(files);
              }
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) event.preventDefault();
            }}
            onDrop={(event) => {
              const files = Array.from(event.dataTransfer.files);
              if (!files.length) return;
              event.preventDefault();
              void upload(files);
            }}
            placeholder={
              "## Mở đầu\n\nViết nội dung ở đây. Công thức trong dòng: $x^2 + y^2 = r^2$\n\nCông thức dòng riêng:\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n\nHóa học: $\\ce{2H2 + O2 -> 2H2O}$\n\nDán hoặc kéo thả ảnh vào đây để chèn ảnh."
            }
            className={cn(
              "w-full resize-none bg-surface px-4 py-3 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-muted disabled:opacity-70",
              editorHeight,
            )}
          />
        )}
        {mode !== "write" && (
          <div
            className={cn(
              "overflow-y-auto px-5 py-2",
              editorHeight,
              mode === "split" && "hidden lg:block",
            )}
            aria-label="Xem trước"
          >
            {value.trim() ? (
              <ArticleMarkdown content={value} />
            ) : (
              <p className="py-10 text-center text-sm text-muted">Bản xem trước sẽ hiện ở đây.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-caption text-muted">
        <span>
          {uploading > 0
            ? `Đang tải ${uploading} ảnh lên…`
            : "Markdown · $công thức$ trong dòng · $$công thức$$ dòng riêng · \\ce{} cho hóa học"}
        </span>
        <span>
          {value.length.toLocaleString("vi-VN")} / {maxLength.toLocaleString("vi-VN")} ký tự
        </span>
      </div>
    </div>
  );
}

function FormulaPanel({ onPick }: { onPick: (snippet: Snippet) => void }) {
  const [subject, setSubject] = useState(SNIPPETS[0]!.subject);
  const group = SNIPPETS.find((item) => item.subject === subject) ?? SNIPPETS[0]!;
  return (
    <div className="border-b border-border bg-surface-secondary p-3">
      <div role="tablist" aria-label="Môn học" className="mb-3 flex gap-1">
        {SNIPPETS.map((item) => (
          <button
            key={item.subject}
            type="button"
            role="tab"
            aria-selected={item.subject === subject}
            onClick={() => setSubject(item.subject)}
            className={cn(
              "min-h-8 rounded-full px-3 text-xs font-semibold",
              item.subject === subject ? "bg-primary text-primary-foreground" : "hover:bg-surface-hover",
            )}
          >
            {item.subject}
          </button>
        ))}
      </div>
      <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {group.items.map((snippet) => (
          <button
            key={snippet.label}
            type="button"
            onClick={() => onPick(snippet)}
            className="flex min-h-16 flex-col items-start gap-1 rounded-md border border-border bg-surface px-3 py-2 text-left hover:border-primary"
          >
            <span className="text-xs font-semibold text-muted">
              {snippet.label}
              {snippet.display ? " · dòng riêng" : ""}
            </span>
            <span
              className="max-w-full overflow-x-auto text-sm"
              dangerouslySetInnerHTML={{ __html: renderMath(snippet.tex, false) }}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-caption text-muted">
        Bấm để chèn vào vị trí con trỏ rồi sửa số liệu trong ô soạn thảo. Bản xem trước cập nhật ngay.
      </p>
    </div>
  );
}

function HelpPanel() {
  const rows: Array<[string, string]> = [
    ["Công thức trong câu", "Diện tích $S = \\pi r^2$ của hình tròn"],
    ["Công thức dòng riêng", "$$\n\\frac{a}{b} + \\sqrt{x}\n$$"],
    ["Phân số, căn, mũ, chỉ số", "$\\frac{1}{2}$, $\\sqrt{2}$, $x^{2}$, $a_{n}$"],
    ["Phương trình hóa học", "$\\ce{Fe + 2HCl -> FeCl2 + H2 ^}$"],
    ["Đơn vị vật lý", "$\\pu{9.8 m/s^2}$ hoặc $10\\ \\text{km/h}$"],
    ["Ảnh", "Bấm nút ảnh, dán ảnh (Ctrl+V) hoặc kéo thả vào ô soạn thảo"],
    ["Tiêu đề, đậm, danh sách", "## Tiêu đề · **đậm** · - ý"],
  ];
  return (
    <div className="border-b border-border bg-surface-secondary p-3 text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([what, how]) => (
            <tr key={what} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3 align-top font-medium">{what}</td>
              <td className="py-1.5">
                <code className="whitespace-pre-wrap rounded bg-surface px-1.5 py-0.5 font-mono text-xs">{how}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-muted">
        Công thức viết theo cú pháp LaTeX (KaTeX); hóa học dùng <code>\ce{"{…}"}</code>. Bấm{" "}
        <strong>Công thức</strong> để chọn mẫu có sẵn.
      </p>
    </div>
  );
}
