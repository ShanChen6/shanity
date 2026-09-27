import type { ReactNode } from "react";

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
      <main className={`flex-1 ${mainClassName}`}>{children}</main>
      {footer}
    </div>
  );
}
