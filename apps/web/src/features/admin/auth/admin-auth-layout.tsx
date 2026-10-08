import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

export function AdminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#admin-login-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3"
      >
        Đến biểu mẫu đăng nhập
      </a>
      <header className="border-b border-border bg-surface px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <BrandLogo
            href="/admin/login"
            label="Shanity Admin"
            width={120}
            highPriority
          />
          <span className="border-l border-border pl-4 text-sm font-medium text-muted">
            Admin Portal
          </span>
        </div>
      </header>
      <main
        id="admin-login-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6"
      >
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted">
        Shanity · Khu vực dành riêng cho quản trị viên.
      </footer>
    </div>
  );
}
