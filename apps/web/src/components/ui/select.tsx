import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function Select({
  className = "",
  ...props
}: ComponentPropsWithRef<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "control w-full min-w-0 rounded-md border border-input bg-surface px-3.5 py-2.5 text-base text-foreground hover:border-input-hover focus-visible:border-input-focus disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-disabled-foreground disabled:opacity-70 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        className,
      )}
    />
  );
}
