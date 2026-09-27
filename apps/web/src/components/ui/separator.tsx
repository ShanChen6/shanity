import type { ComponentPropsWithRef } from "react";

export function Separator({
  className = "",
  ...props
}: ComponentPropsWithRef<"hr">) {
  return (
    <hr {...props} className={`border-0 border-t border-border ${className}`} />
  );
}
