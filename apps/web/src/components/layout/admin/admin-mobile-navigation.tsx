"use client";
import Link from "next/link";
import { ThemeCycleButton } from "@/components/shared/theme-cycle-button";
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
      <div className="flex items-center justify-between px-3 pt-2 sm:hidden">
        <span className="text-sm text-muted">Giao diện</span>
        <ThemeCycleButton />
      </div>
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
