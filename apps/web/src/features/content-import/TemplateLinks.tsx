import { Download } from "lucide-react";

export type Template = { href: string; label: string };

export const QUIZ_TEMPLATES: Template[] = [
  { href: "/templates/quiz-import-template.xlsx", label: "Mẫu Excel" },
  { href: "/templates/quiz-import-sample.json", label: "Mẫu JSON" },
  { href: "/templates/quiz-import-sample.md", label: "Mẫu Markdown" },
];
export const LESSON_TEMPLATES: Template[] = [
  { href: "/templates/lesson-import-sample.md", label: "Mẫu Markdown" },
  { href: "/templates/lesson-import-sample.json", label: "Mẫu JSON" },
];

export function TemplateLinks({ templates }: { templates: Template[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="text-muted">Tải file mẫu:</span>
      {templates.map((template) => (
        <a
          key={template.href}
          href={template.href}
          download
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          <Download aria-hidden size={12} />
          {template.label}
        </a>
      ))}
    </div>
  );
}
