import type { ComponentPropsWithRef } from "react";
export function Input({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      className={`control w-full min-w-0 rounded-control border border-border bg-surface px-3.5 py-3 text-base text-foreground placeholder:text-muted focus:border-focus disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60 aria-invalid:border-danger ${className}`}
    />
  );
}
