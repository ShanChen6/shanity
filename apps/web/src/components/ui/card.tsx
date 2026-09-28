import type { ComponentPropsWithRef } from "react";
export function Card({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return (
    <div
      {...props}
      className={`rounded-card border border-border bg-surface p-5 shadow-card sm:p-6 ${className}`}
    />
  );
}
