import type { ComponentPropsWithRef } from "react";
export function Input({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      className={`control w-full min-w-0 rounded-md border border-input bg-surface px-3.5 py-2.5 text-base text-foreground placeholder:text-muted hover:border-input-hover focus-visible:border-input-focus disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-disabled-foreground disabled:opacity-70 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger ${className}`}
    />
  );
}
