"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  error: "border-danger/40 bg-danger-background text-danger-foreground",
  warning: "border-warning/40 bg-warning-background text-warning-foreground",
  success: "border-success/40 bg-success-background text-success-foreground",
  info: "border-border-strong bg-surface text-foreground",
};

export type ToastTone = keyof typeof tones;

/** The toast's look, without positioning; the provider stacks these. */
export function ToastCard({
  message,
  tone = "info",
  onClose,
  className = "",
  ...handlers
}: {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
  className?: string;
} & Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onMouseEnter" | "onMouseLeave" | "onFocus" | "onBlur"
>) {
  return (
    <div
      {...handlers}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-sm shadow-lg",
        tones[tone],
        className,
      )}
    >
      <p className="min-w-0 flex-1 break-words">{message}</p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onClose}
        className="-m-1 rounded-md p-1 opacity-80 hover:opacity-100"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}

// Mount to show, unmount to hide. Errors use role="alert" so they are announced.
export function Toast({
  message,
  tone = "info",
  onClose,
  duration = 6000,
}: {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onClose]);
  return (
    <ToastCard
      message={message}
      tone={tone}
      onClose={onClose}
      className="fixed inset-x-4 bottom-20 z-50 sm:left-auto sm:right-6 sm:w-96"
    />
  );
}
