"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "@/features/auth/current-user-avatar";
import { useSession } from "@/features/auth/session-provider";
import { loginUrl } from "@/lib/auth-redirect";

const linkClass = (active: boolean) =>
  `rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover ${
    active
      ? "text-primary"
      : "text-foreground-secondary hover:text-foreground"
  }`;

export function SiteNav() {
  const { user, status, logout } = useSession();
  const pathname = usePathname();
  const is = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);

  const links = [{ href: "/courses", label: "Khóa học" }];
  if (user) {
    links.push({ href: "/my-courses", label: "Khóa học của tôi" });
    if (user.roles.includes("instructor"))
      links.push({ href: "/instructor/courses", label: "Giảng viên" });
    if (user.roles.includes("admin"))
      links.push({ href: "/admin", label: "Quản trị" });
  }

  return (
    <nav
      className="flex flex-wrap items-center gap-1 sm:gap-2"
      aria-label="Chính"
    >
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={is(item.href) ? "page" : undefined}
          className={linkClass(is(item.href))}
        >
          {item.label}
        </Link>
      ))}
      {user ? (
        <>
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-hover"
          >
            <CurrentUserAvatar />
            <span className="hidden max-w-32 truncate text-sm font-semibold sm:inline">
              {user.displayName}
            </span>
          </Link>
          <button
            type="button"
            className={linkClass(false)}
            onClick={() => void logout().catch(() => undefined)}
          >
            Đăng xuất
          </button>
        </>
      ) : status === "loading" ? null : (
        <Link href="/login" className={linkClass(false)}>
          Đăng nhập
        </Link>
      )}
    </nav>
  );
}

export function CourseCta({ slug }: { slug: string }) {
  const { user, status } = useSession();
  if (user)
    return (
      <Link
        href={`/learn/${encodeURIComponent(slug)}`}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        Vào học
      </Link>
    );
  return (
    <>
      <Link
        href={loginUrl(`/learn/${encodeURIComponent(slug)}`)}
        aria-busy={status === "loading"}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        Đăng nhập để học
      </Link>
      <p className="mt-3 text-center text-caption text-muted">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Tạo tài khoản
        </Link>
      </p>
    </>
  );
}
