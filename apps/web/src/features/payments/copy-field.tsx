"use client";

import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCopy } from "./use-copy";

/** A labelled value with a one-tap copy button (account number, memo...). */
export function CopyField({
  label,
  value,
  display,
  emphasize = false,
}: {
  label: string;
  /** What lands on the clipboard. */
  value: string;
  /** What is shown (defaults to value), e.g. "499.000 ₫" while copying "499000". */
  display?: string;
  emphasize?: boolean;
}) {
  const { copy, copied, failed } = useCopy();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-secondary/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-caption text-muted">{label}</p>
        <p
          className={cn(
            "font-mono [overflow-wrap:anywhere]",
            emphasize
              ? "text-body font-semibold text-primary"
              : "text-body-sm font-semibold",
          )}
        >
          {display ?? value}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Sao chép ${label.toLowerCase()}`}
        onClick={() => void copy(value)}
        className="shrink-0"
      >
        {copied ? (
          <>
            <Check aria-hidden size={14} />
            Đã chép
          </>
        ) : (
          <>
            <Copy aria-hidden size={14} />
            Sao chép
          </>
        )}
      </Button>
      <span role="status" className="sr-only">
        {copied ? `Đã sao chép ${label.toLowerCase()}` : ""}
        {failed ? "Không sao chép được, hãy chép thủ công" : ""}
      </span>
    </div>
  );
}
