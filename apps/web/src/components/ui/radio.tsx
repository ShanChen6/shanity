import type { ComponentPropsWithRef } from "react";

export function Radio({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      type="radio"
      className={`size-4 accent-primary focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:outline-danger ${className}`}
    />
  );
}
