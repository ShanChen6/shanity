import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function Separator({
  className = "",
  ...props
}: ComponentPropsWithRef<"hr">) {
  return (
    <hr
      {...props}
      className={cn("border-0 border-t border-border", className)}
    />
  );
}
