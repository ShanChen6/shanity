"use client";
import Link from "next/link";
import { AdminNavigation } from "./admin-navigation";

export function AdminMobileNavigation({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <div
      id="admin-mobile-navigation"
      hidden={!open}
      className="max-h-[65dvh] overflow-y-auto border-t border-border p-4 lg:hidden"
    >
      <AdminNavigation onNavigate={onNavigate} />
      <Link
        href="/"
        onNavigate={onNavigate}
        className="mt-2 flex min-h-11 items-center px-3 text-sm text-muted"
      >
        ← Về Shanity
      </Link>
    </div>
  );
}
