import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-surface-secondary motion-reduce:animate-none",
        className,
      )}
    />
  );
}
