"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeCycleButton } from "@/components/shared/theme-cycle-button";
import { Icon } from "@/components/ui/icon";
import {
  activeNavItem,
  navigationFor,
  portalsFor,
  studentNav,
  type NavItem,
} from "@/config/navigation.config";
import { useSession } from "@/features/auth/session-provider";
import { UserMenu } from "@/features/auth/user-menu";
import { CommandMenuTrigger } from "@/features/command-menu/command-menu";
import { NotificationBell } from "@/features/notifications/notification-bell";

const PUBLIC_NAV: readonly NavItem[] = [
  { href: "/courses", label: "Khóa học", icon: "search" },
];

const linkClass = (active: boolean) =>
  `inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover ${
    active ? "text-primary" : "text-foreground-secondary"
  }`;

/**
 * Header of every public and learner page. The links, search, bell and menus
 * all come from config/ and the session, so it adapts to the visitor's roles
 * without any page deciding what to show.
 */
export function SiteHeader() {
  const { user, status } = useSession();
  const pathname = usePathname();
  // Remember where the panel was opened: navigating elsewhere closes it
  // without an effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const toggle = useRef<HTMLButtonElement>(null);

  const items = user ? navigationFor(studentNav, user.roles) : PUBLIC_NAV;
  const current = activeNavItem(pathname, items);
  const portals = user
    ? portalsFor(user.roles).filter((portal) => portal.id !== "student")
    : [];

  const mobileItems = [
    ...items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      active: item === current,
    })),
    ...portals.map((portal) => ({
      href: portal.href,
      label: portal.label,
      icon: portal.icon,
      active: false,
    })),
  ];

  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpenedOn(null);
          toggle.current?.focus();
        }
      }}
    >
      <div className="container flex min-h-16 items-center gap-2 sm:gap-3">
        {/* Below 640px the wordmark would push the controls off a 320px screen. */}
        <BrandLogo
          variant="icon"
          width={36}
          highPriority
          className="mr-1 shrink-0 sm:hidden"
        />
        <BrandLogo
          width={118}
          highPriority
          className="mr-1 hidden shrink-0 sm:inline-flex"
        />
        <nav
          aria-label="Điều hướng chính"
          className="hidden flex-1 items-center gap-1 xl:flex"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item === current ? "page" : undefined}
              className={linkClass(item === current)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <CommandMenuTrigger compact />
          {user && <NotificationBell />}
          {/* Phones get the theme switch inside the menu panel instead. */}
          <div className="hidden sm:flex">
            <ThemeCycleButton />
          </div>
          {user ? (
            <nav aria-label="Tài khoản">
              <UserMenu />
            </nav>
          ) : status === "loading" ? null : (
            <>
              <Link href="/login" className={linkClass(false)}>
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="hidden min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover sm:inline-flex"
              >
                Tạo tài khoản
              </Link>
            </>
          )}
          <button
            ref={toggle}
            type="button"
            aria-label={open ? "Đóng menu" : "Mở menu"}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            onClick={() => setOpenedOn(open ? null : pathname)}
            className="flex size-11 items-center justify-center rounded-md text-foreground hover:bg-surface-hover xl:hidden"
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="site-mobile-nav"
          aria-label="Điều hướng chính (di động)"
          className="container grid gap-1 border-t border-border py-3 xl:hidden"
        >
          <div className="flex items-center justify-between px-3 pb-1 sm:hidden">
            <span className="text-sm text-muted">Giao diện</span>
            <ThemeCycleButton />
          </div>
          {mobileItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-surface-hover ${
                item.active ? "bg-secondary text-secondary-foreground" : ""
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
