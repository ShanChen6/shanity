"use client";
import { useRef } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TextLessonViewer } from "@/features/lessons/text-lesson-viewer";
import type { LessonFormValues } from "../schema";

const TOOLS = [
  { label: "H2", open: "<h2>", close: "</h2>", hint: "Tiêu đề" },
  { label: "B", open: "<strong>", close: "</strong>", hint: "In đậm" },
  { label: "I", open: "<em>", close: "</em>", hint: "In nghiêng" },
  { label: "Code", open: "<code>", close: "</code>", hint: "Mã" },
  { label: "• List", open: "<ul><li>", close: "</li></ul>", hint: "Danh sách" },
  {
    label: "Link",
    open: '<a href="https://">',
    close: "</a>",
    hint: "Liên kết",
  },
] as const;

export function TextLessonEditor({
  form,
  disabled,
}: {
  form: UseFormReturn<LessonFormValues>;
  disabled: boolean;
}) {
  const field = form.register("textBody");
  const area = useRef<HTMLTextAreaElement | null>(null);
  const body = useWatch({ control: form.control, name: "textBody" });
  const error = form.formState.errors.textBody?.message;

  function wrap(open: string, close: string) {
    const element = area.current;
    if (!element) return;
    const { selectionStart, selectionEnd, value } = element;
    const selected = value.slice(selectionStart, selectionEnd) || "nội dung";
    const next = `${value.slice(0, selectionStart)}${open}${selected}${close}${value.slice(selectionEnd)}`;
    form.setValue("textBody", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
    element.focus();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="lesson-text-body">
          Nội dung bài học (HTML an toàn)
        </Label>
        <div
          className="flex flex-wrap gap-1"
          role="toolbar"
          aria-label="Định dạng"
        >
          {TOOLS.map((tool) => (
            <Button
              key={tool.label}
              size="sm"
              variant="outline"
              disabled={disabled}
              title={tool.hint}
              onClick={() => wrap(tool.open, tool.close)}
            >
              {tool.label}
            </Button>
          ))}
        </div>
        <Textarea
          id="lesson-text-body"
          rows={10}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "lesson-text-body-error" : undefined}
          placeholder="<h2>Tiêu đề</h2><p>Nội dung bài học…</p>"
          {...field}
          ref={(element) => {
            field.ref(element);
            area.current = element;
          }}
        />
        {error && (
          <p id="lesson-text-body-error" className="text-sm text-danger">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">
          Script, iframe và thuộc tính nguy hiểm sẽ tự động bị loại bỏ.
        </p>
      </div>
      <section
        aria-label="Xem trước nội dung"
        className="rounded-md border border-border p-3"
      >
        <h3 className="pb-2 text-xs font-semibold uppercase text-muted">
          Xem trước
        </h3>
        {body.trim() ? (
          <TextLessonViewer content={body} />
        ) : (
          <p className="text-sm text-muted">
            Nội dung xem trước sẽ hiển thị tại đây.
          </p>
        )}
      </section>
    </div>
  );
}
