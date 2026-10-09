import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "bg-surface-secondary text-foreground-secondary",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border-strong bg-transparent text-foreground",
  neutral: "bg-surface-secondary text-foreground-secondary",
  primary: "bg-secondary text-secondary-foreground",
  success: "bg-success-background text-success-foreground",
  warning: "bg-warning-background text-warning-foreground",
  danger: "bg-danger-background text-danger-foreground",
  info: "bg-info-background text-info-foreground",
};

export function Badge({
  tone = "default",
  className = "",
  ...props
}: ComponentPropsWithRef<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
    />
  );
}
