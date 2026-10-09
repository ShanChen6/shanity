"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DialogProps = {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  /** While true the dialog cannot be dismissed (Escape / backdrop). */
  busy?: boolean;
  side?: "center" | "right" | "left";
  className?: string;
};

// Mount to open, unmount to close. Built on native <dialog> for focus trapping and Escape handling.
export function Dialog({
  title,
  description,
  children,
  onClose,
  busy = false,
  side = "center",
  className = "",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Unique per instance so nested dialogs keep their own accessible names.
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    return () => {
      if (dialog?.open) dialog.close?.();
      previous?.focus?.();
    };
  }, []);
  const position =
    side === "right"
      ? "m-0 ml-auto h-dvh max-h-none w-full max-w-xl rounded-none"
      : side === "left"
        ? "m-0 mr-auto h-dvh max-h-none w-full max-w-sm rounded-none"
        : "m-auto w-full max-w-lg rounded-lg";
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      className={cn(
        "overflow-y-auto border border-border bg-surface p-6 text-foreground backdrop:bg-black/50",
        position,
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
    >
      <div className="space-y-1 pb-4">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        {description && (
          <p id={`${id}-description`} className="text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      {children}
    </dialog>
  );
}

export function Sheet({
  side = "right",
  ...props
}: Omit<DialogProps, "side"> & { side?: "right" | "left" }) {
  return <Dialog {...props} side={side} />;
}
