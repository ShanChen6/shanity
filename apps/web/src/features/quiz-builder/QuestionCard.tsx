"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  markCorrect,
  newOption,
  withType,
  type QuestionDraft,
  type QuestionType,
} from "./model";

const MAX_OPTIONS = 50;

export function QuestionCard({
  question,
  index,
  issues,
  readOnly,
  canRemove,
  onChange,
  onRemove,
  onDuplicate,
}: {
  question: QuestionDraft;
  index: number;
  issues: string[];
  readOnly: boolean;
  canRemove: boolean;
  onChange: (question: QuestionDraft) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.key, disabled: readOnly });
  const label = `Câu ${index + 1}`;
  const single = question.type === "SINGLE_CHOICE";
  const set = (patch: Partial<QuestionDraft>) =>
    onChange({ ...question, ...patch });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-surface p-4 shadow-sm sm:p-5 ${
        issues.length ? "border-danger/60" : "border-border"
      } ${isDragging ? "relative z-10 opacity-80 shadow-lg" : ""}`}
      aria-label={label}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={readOnly}
          aria-label={`Kéo để sắp xếp ${label}`}
          className="cursor-grab touch-none rounded-md p-1 text-muted hover:bg-surface-hover active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GripVertical aria-hidden size={18} />
        </button>
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="sr-only sm:not-sr-only">Loại</span>
            <Select
              aria-label={`Loại ${label}`}
              value={question.type}
              disabled={readOnly}
              className="!w-auto py-1.5 text-sm"
              onChange={(event) =>
                onChange(withType(question, event.target.value as QuestionType))
              }
            >
              <option value="SINGLE_CHOICE">Một đáp án</option>
              <option value="MULTIPLE_CHOICE">Nhiều đáp án</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            Điểm
            <Input
              aria-label={`Điểm ${label}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={32767}
              value={question.points}
              disabled={readOnly}
              className="!w-20 py-1.5 text-sm"
              onChange={(event) => set({ points: event.target.value })}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            onClick={onDuplicate}
            aria-label={`Nhân bản ${label}`}
          >
            <Copy aria-hidden size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly || !canRemove}
            onClick={onRemove}
            aria-label={`Xóa ${label}`}
            className="!text-danger-foreground"
          >
            <Trash2 aria-hidden size={15} />
          </Button>
        </div>
      </div>

      <label className="mt-4 block text-sm font-medium">
        Nội dung câu hỏi
        <Textarea
          value={question.content}
          disabled={readOnly}
          maxLength={20000}
          placeholder="Ví dụ: TypeScript là gì?"
          className="mt-2 !min-h-20"
          aria-invalid={
            issues.length > 0 && !question.content.trim() ? true : undefined
          }
          onChange={(event) => set({ content: event.target.value })}
        />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">
          Đáp án{" "}
          <span className="font-normal text-muted">
            ({single ? "chọn 1 đáp án đúng" : "đánh dấu mọi đáp án đúng"})
          </span>
        </legend>
        <ul className="mt-2 space-y-2">
          {question.options.map((option, optionIndex) => {
            const Control = single ? Radio : Checkbox;
            return (
              <li key={option.key} className="flex items-center gap-3">
                <Control
                  name={`correct-${question.key}`}
                  checked={option.isCorrect}
                  disabled={readOnly}
                  aria-label={`Đáp án ${optionIndex + 1} đúng`}
                  onChange={(event) =>
                    onChange(
                      markCorrect(question, option.key, event.target.checked),
                    )
                  }
                />
                <Input
                  value={option.content}
                  disabled={readOnly}
                  maxLength={2000}
                  aria-label={`Nội dung đáp án ${optionIndex + 1}`}
                  placeholder={`Đáp án ${optionIndex + 1}`}
                  className={`py-2 text-sm ${option.isCorrect ? "border-success/60" : ""}`}
                  onChange={(event) =>
                    set({
                      options: question.options.map((item) =>
                        item.key === option.key
                          ? { ...item, content: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readOnly || question.options.length <= 2}
                  aria-label={`Xóa đáp án ${optionIndex + 1}`}
                  onClick={() =>
                    set({
                      options: question.options.filter(
                        (item) => item.key !== option.key,
                      ),
                    })
                  }
                >
                  <X aria-hidden size={15} />
                </Button>
              </li>
            );
          })}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={readOnly || question.options.length >= MAX_OPTIONS}
          onClick={() => set({ options: [...question.options, newOption()] })}
        >
          <Plus aria-hidden size={14} /> Thêm đáp án
        </Button>
      </fieldset>

      <label className="mt-4 block text-sm font-medium">
        Giải thích đáp án{" "}
        <span className="font-normal text-muted">(tùy chọn)</span>
        <Textarea
          value={question.explanation}
          disabled={readOnly}
          maxLength={20000}
          placeholder="Vì sao đáp án này đúng? Hiển thị cho học viên theo chính sách xem đáp án."
          className="mt-2 !min-h-16 text-sm"
          onChange={(event) => set({ explanation: event.target.value })}
        />
      </label>

      {issues.length ? (
        <ul
          className="mt-3 space-y-1 text-xs text-danger-foreground"
          role="list"
        >
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
