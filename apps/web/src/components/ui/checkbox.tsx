import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      type="checkbox"
      className={cn(
        "size-4 rounded border-input accent-primary focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:outline-danger",
        className,
      )}
    />
  );
}
