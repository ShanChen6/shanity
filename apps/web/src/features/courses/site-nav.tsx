"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/features/auth/user-menu";
import { useSession } from "@/features/auth/session-provider";

const linkClass = (active: boolean) =>
  `rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover ${
    active ? "text-primary" : "text-foreground-secondary hover:text-foreground"
  }`;

export function SiteNav() {
  const { user, status } = useSession();
  const pathname = usePathname();
  const is = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);

  const links = [{ href: "/courses", label: "Khóa học" }];
  if (user) {
    links.push({ href: "/my-learning", label: "Góc học tập" });
    links.push({ href: "/account/orders", label: "Đơn hàng" });
    links.push({ href: "/quizzes", label: "Quiz" });
    links.push({ href: "/my-quiz-attempts", label: "Bài thi của tôi" });
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
        <UserMenu />
      ) : status === "loading" ? null : (
        <Link href="/login" className={linkClass(false)}>
          Đăng nhập
        </Link>
      )}
    </nav>
  );
}
