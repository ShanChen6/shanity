import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  header,
  footer,
  mainClassName = "",
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="page flex flex-col">
      {header}
      <main className={cn("flex-1", mainClassName)}>{children}</main>
      {footer}
    </div>
  );
}
