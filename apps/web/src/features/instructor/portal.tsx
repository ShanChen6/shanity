"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedSession } from "@/features/auth/protected-session";
import { useSession } from "@/features/auth/session-provider";
import { CurrentUserAvatar } from "@/features/auth/current-user-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ThemeCycleButton } from "@/components/shared/theme-cycle-button";
import { Icon } from "@/components/ui/icon";
import {
  activeNavItem,
  instructorNav,
  navigationFor,
} from "@/config/navigation.config";
import { CommandMenuTrigger } from "@/features/command-menu/command-menu";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { ApiError } from "@/lib/api";
import "./portal.css";
export function InstructorPortal({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <ProtectedSession requiredRole="instructor">
      <PortalSession key={user?.id}>{children}</PortalSession>
    </ProtectedSession>
  );
}
function PortalSession({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const pathname = usePathname();
  const items = navigationFor(instructorNav, user?.roles ?? []);
  const current = activeNavItem(pathname, items);
  const [error, setError] = useState("");
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15000,
            retry: (count, error) =>
              !(
                error instanceof ApiError &&
                [401, 403, 404].includes(error.status)
              ) && count < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <div className="instructor-portal">
        <aside className="instructor-sidebar">
          <div className="instructor-brand">
            {/* The sidebar is dark in both themes, so it needs the white wordmark. */}
            <BrandLogo
              href="/instructor/dashboard"
              surface="dark"
              width={132}
              highPriority
            />
            <span>KHÔNG GIAN GIẢNG VIÊN</span>
          </div>
          <nav aria-label="Điều hướng giảng viên">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item === current ? "page" : undefined}
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </Link>
            ))}
            <Link href="/courses">
              <Icon name="external" className="size-4" />
              Khám phá khóa học
            </Link>
          </nav>
          <p className="instructor-sidebar-note">
            Chia sẻ kiến thức.
            <br />
            Tạo nên những hành trình học tập.
          </p>
        </aside>
        <div className="instructor-workspace">
          <header className="instructor-header">
            <Breadcrumbs alwaysShow className="min-w-0 flex-1" />
            <div className="instructor-actions">
              <CommandMenuTrigger />
              <NotificationBell />
              <ThemeCycleButton />
              <Link href="/profile" className="instructor-profile">
                <CurrentUserAvatar className="size-9" />
                <span>{user?.displayName}</span>
              </Link>
              <button
                onClick={() => {
                  void logout().catch(() =>
                    setError("Không thể đăng xuất. Vui lòng thử lại."),
                  );
                }}
              >
                Đăng xuất
              </button>
            </div>
          </header>
          <main className="instructor-main">
            {error && <p role="alert">{error}</p>}
            {children}
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
