"use client";
import Link from "next/link";
import { AdminLogout } from "@/features/admin/auth/admin-logout";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CurrentUserAvatar } from "@/features/auth/current-user-avatar";
import { useSession } from "@/features/auth/session-provider";
import { ThemeCycleButton } from "@/components/shared/theme-cycle-button";
import { breadcrumbsFor } from "@/config/breadcrumbs";
import { CommandMenuTrigger } from "@/features/command-menu/command-menu";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { Breadcrumbs } from "../breadcrumbs";
import { AdminMobileNavigation } from "./admin-mobile-navigation";

export function AdminHeader({ homeHref = "/admin" }: { homeHref?: string }) {
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
  const usersQuery = new URLSearchParams();
  for (const name of ["page", "search", "role", "status"]) {
    const value = search.get(name);
    if (value) usersQuery.set(name, value);
  }
  // Same trail as everywhere else, with the two admin-specific links: the
  // first crumb follows the role's home, and "Người dùng" keeps the list's
  // filters so Back returns to the same page of results.
  const trail = breadcrumbsFor(pathname).map((crumb) => {
    if (crumb.href === "/admin") return { ...crumb, href: homeHref };
    if (crumb.href === "/admin/users" && usersQuery.size > 0)
      return { ...crumb, href: `/admin/users?${usersQuery}` };
    return crumb;
  });
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
        <Breadcrumbs items={trail} alwaysShow className="min-w-0 flex-1" />
        {/* Wrapper, not a `hidden` class on the trigger: that would fight its own display. */}
        <div className="hidden items-center gap-1 sm:flex">
          <CommandMenuTrigger compact />
          <NotificationBell />
          <ThemeCycleButton />
        </div>
        <Link
          href="/profile"
          className="flex min-h-11 max-w-[45%] min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-surface-hover"
          aria-label="Hồ sơ của bạn"
        >
          <CurrentUserAvatar className="size-9" />
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate font-medium">
              {user?.displayName}
            </span>
            <span className="block text-xs text-muted">
              {user?.roles.includes("admin")
                ? "Quản trị viên"
                : "Nhân viên tài chính"}
            </span>
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
