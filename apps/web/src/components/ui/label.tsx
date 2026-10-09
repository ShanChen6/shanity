import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function Label({
  className = "",
  ...props
}: ComponentPropsWithRef<"label">) {
  return (
    <label {...props} className={cn("block text-sm font-semibold", className)} />
  );
}
