import type { ComponentPropsWithRef } from "react";
const variants = {
  default: "border-border bg-surface shadow-sm",
  interactive:
    "border-border bg-surface shadow-sm transition-colors hover:border-border-strong hover:bg-surface-hover",
  elevated: "border-border bg-surface-elevated shadow-md",
};
export function Card({
  variant = "default",
  className = "",
  ...props
}: ComponentPropsWithRef<"div"> & { variant?: keyof typeof variants }) {
  return (
    <div
      {...props}
      className={`rounded-lg border p-5 sm:p-6 ${variants[variant]} ${className}`}
    />
  );
}
