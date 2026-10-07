import Link from "next/link";
import { AdminNavigation } from "./admin-navigation";

export function AdminSidebar({ homeHref = "/admin" }: { homeHref?: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh overflow-y-auto flex-col border-r border-border bg-surface p-5 lg:flex">
      <Link
        href={homeHref}
        className="mb-1 inline-flex min-h-11 items-center text-2xl font-bold tracking-tight"
      >
        shanity<span className="text-primary">.</span>
      </Link>
      <p className="mb-8 text-xs font-semibold uppercase tracking-widest text-muted">
        Quản trị
      </p>
      <AdminNavigation />
      <Link
        href="/"
        className="mt-auto flex min-h-11 items-center rounded-md px-3 text-sm text-muted hover:bg-surface-hover"
      >
        ← Về Shanity
      </Link>
    </aside>
  );
}
