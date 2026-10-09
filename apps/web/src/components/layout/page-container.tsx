import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return <div {...props} className={cn("container", className)} />;
}
