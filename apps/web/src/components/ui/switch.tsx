import type { ComponentPropsWithRef } from "react";

export function Switch({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      type="checkbox"
      role="switch"
      className={`switch-control focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
}
