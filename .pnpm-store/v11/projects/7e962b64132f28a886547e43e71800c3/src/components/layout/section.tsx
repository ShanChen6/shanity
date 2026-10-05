import type { ComponentPropsWithRef } from "react";

export function Section({
  className = "",
  ...props
}: ComponentPropsWithRef<"section">) {
  return <section {...props} className={`section ${className}`} />;
}
