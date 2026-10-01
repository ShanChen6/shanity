import type { ReactNode } from "react";

export function AdminMainContent({ children }: { children: ReactNode }) {
  return (
    <main
      id="admin-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
    >
      {children}
    </main>
  );
}
