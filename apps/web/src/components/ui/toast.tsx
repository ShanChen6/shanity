"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

const tones = {
  error: "border-danger/40 bg-danger-background text-danger-foreground",
  info: "border-border-strong bg-surface text-foreground",
};

// Mount to show, unmount to hide. Errors use role="alert" so they are announced.
export function Toast({
  message,
  tone = "info",
  onClose,
  duration = 6000,
}: {
  message: string;
  tone?: keyof typeof tones;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onClose]);
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`fixed inset-x-4 bottom-20 z-50 flex items-start gap-3 rounded-lg border p-4 text-sm shadow-lg sm:left-auto sm:right-6 sm:w-96 ${tones[tone]}`}
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
