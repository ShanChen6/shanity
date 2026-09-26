import type { ComponentPropsWithRef } from "react";
export function PageContainer({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return <div {...props} className={`page-container ${className}`} />;
}
