"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAT_MESSAGE_MAX_LENGTH } from "./api";

const full = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Enter sends, Shift+Enter breaks the line. Enter that ends an IME
 * composition (Vietnamese Telex/VNI input) only commits the word.
 */
export function ChatComposer({
  onSend,
  sending,
  mutedUntil,
  offline,
}: {
  /** Resolves true when the message was accepted (the draft is cleared). */
  onSend: (content: string) => Promise<boolean>;
  sending: boolean;
  mutedUntil: string | null;
  offline: boolean;
}) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const content = draft.trim();
  const tooLong = draft.length > CHAT_MESSAGE_MAX_LENGTH;
  const disabled = Boolean(mutedUntil) || offline;
  const canSend = !disabled && !sending && content.length > 0 && !tooLong;

  async function submit() {
    if (!canSend) return;
    if (await onSend(content)) {
      setDraft("");
      input.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  }

  if (mutedUntil)
    return (
      <div
        role="status"
        data-testid="chat-muted"
        className="border-t border-border bg-warning-background px-4 py-3 text-sm text-warning-foreground"
      >
        Bạn đang bị tạm khóa gửi tin trong phòng này đến{" "}
        <strong>{full.format(new Date(mutedUntil))}</strong>. Bạn vẫn có thể
        đọc tin nhắn.
      </div>
    );

  return (
    <form
      className="border-t border-border bg-surface px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-end gap-2">
        <label htmlFor="chat-composer" className="sr-only">
          Tin nhắn
        </label>
        <textarea
          id="chat-composer"
          ref={input}
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={
            offline ? "Đang mất mạng: chưa gửi được tin nhắn" : "Nhập tin nhắn…"
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={tooLong || undefined}
          className={cn(
            "field-sizing-content max-h-40 min-h-11 w-full min-w-0 resize-none rounded-md border border-input bg-surface px-3.5 py-2.5 text-base text-foreground placeholder:text-muted hover:border-input-hover focus-visible:border-input-focus disabled:cursor-not-allowed disabled:bg-surface-secondary",
            tooLong && "border-danger",
          )}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          loading={sending}
          aria-label="Gửi tin nhắn"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-1 flex justify-between text-xs text-muted">
        <span className="max-sm:hidden">
          Enter để gửi, Shift + Enter để xuống dòng
        </span>
        {draft.length > CHAT_MESSAGE_MAX_LENGTH * 0.8 && (
          <span className={cn(tooLong && "font-semibold text-danger-foreground")}>
            {draft.length}/{CHAT_MESSAGE_MAX_LENGTH}
          </span>
        )}
      </p>
    </form>
  );
}
