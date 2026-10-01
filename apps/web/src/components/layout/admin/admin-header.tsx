"use client";
import Link from "next/link";
import { AdminLogout } from "@/features/admin/auth/admin-logout";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { useSession } from "@/features/auth/session-provider";
import { getAdminSection } from "@/features/admin/navigation";
import { AdminMobileNavigation } from "./admin-mobile-navigation";

export function AdminHeader() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { user } = useSession();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const reset = () => {
      if (desktop.matches) {
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          (focused.closest("#admin-mobile-navigation") ||
            focused === toggle.current)
        ) {
          document
            .getElementById("admin-content")
            ?.focus({ preventScroll: true });
        }
        setOpenedOn(null);
      }
    };
    const close = () => setOpenedOn(null);
    desktop.addEventListener("change", reset);
    window.addEventListener("popstate", close);
    return () => {
      desktop.removeEventListener("change", reset);
      window.removeEventListener("popstate", close);
    };
  }, []);
  const toggle = useRef<HTMLButtonElement>(null);
  const section = getAdminSection(pathname);
  const isDetail =
    section?.href === "/admin/users" && pathname !== section.href;
  const usersQuery = new URLSearchParams();
  for (const name of ["page", "search", "role", "status"]) {
    const value = search.get(name);
    if (value) usersQuery.set(name, value);
  }
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
                <li
                  aria-current={isDetail ? undefined : "page"}
                  className="font-medium"
                >
                  {isDetail ? (
                    <Link
                      href={`${section.href}?${usersQuery}`}
                      className="text-muted hover:text-primary"
                    >
                      {section.label}
                    </Link>
                  ) : (
                    section.label
                  )}
                </li>
                {isDetail && (
                  <>
                    <li aria-hidden="true" className="text-muted">
                      /
                    </li>
                    <li aria-current="page" className="font-medium">
                      Chi tiết người dùng
                    </li>
                  </>
                )}
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
        <AdminLogout />
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
