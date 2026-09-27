import type { ComponentPropsWithRef } from "react";

const tones = {
  neutral: "bg-surface-secondary text-foreground-secondary",
  primary: "bg-secondary text-secondary-foreground",
  success: "bg-success-background text-success-foreground",
  warning: "bg-warning-background text-warning-foreground",
  danger: "bg-danger-background text-danger-foreground",
  info: "bg-info-background text-info-foreground",
};

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: ComponentPropsWithRef<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-semibold ${tones[tone]} ${className}`}
    />
  );
}
