import type { ComponentPropsWithRef } from "react";

export function Skeleton({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-surface-secondary motion-reduce:animate-none ${className}`}
    />
  );
}
