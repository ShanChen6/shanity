"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { useSession } from "@/features/auth/session-provider";
import { getAdminSection } from "@/features/admin/navigation";
import { AdminMobileNavigation } from "./admin-mobile-navigation";

export function AdminHeader() {
  const pathname = usePathname();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const section = getAdminSection(pathname);
  return (
    <header
      className="border-b border-border bg-surface"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          ref={toggle}
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          aria-label={open ? "Đóng menu quản trị" : "Mở menu quản trị"}
          aria-expanded={open}
          aria-controls="admin-mobile-navigation"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
        </Button>
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-sm">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              {section?.href !== "/admin" && section ? (
                <Link href="/admin" className="text-muted hover:text-primary">
                  Quản trị
                </Link>
              ) : (
                <span aria-current="page" className="font-medium">
                  Quản trị
                </span>
              )}
            </li>
            {section?.href !== "/admin" && section && (
              <>
                <li aria-hidden="true" className="text-muted">
                  /
                </li>
                <li aria-current="page" className="font-medium">
                  {section.label}
                </li>
              </>
            )}
          </ol>
        </nav>
        <Link
          href="/profile"
          className="flex min-h-11 max-w-[45%] min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-surface-hover"
          aria-label="Hồ sơ của bạn"
        >
          <Avatar
            name={user?.displayName || "Quản trị viên"}
            className="size-9"
          />
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate font-medium">
              {user?.displayName}
            </span>
            <span className="block text-xs text-muted">Quản trị viên</span>
          </span>
        </Link>
      </div>
      <AdminMobileNavigation
        open={open}
        onNavigate={() => {
          setOpen(false);
          toggle.current?.focus();
        }}
      />
    </header>
  );
}
