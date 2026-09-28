import type { ComponentPropsWithRef } from "react";
export function Label({
  className = "",
  ...props
}: ComponentPropsWithRef<"label">) {
  return (
    <label {...props} className={`block text-sm font-semibold ${className}`} />
  );
}
