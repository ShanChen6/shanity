"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";
import { useSession } from "./session-provider";

const linkClass = (active: boolean) =>
  `rounded-md px-3 py-2 text-sm font-semibold hover:bg-surface-hover ${
    active ? "text-primary" : ""
  }`;

export function UserHeader() {
  const session = useSession();
  const pathname = usePathname();
  return (
    <header>
      <nav
        aria-label="Tài khoản"
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <Link href="/" className="text-2xl font-bold">
          shanity.
        </Link>
        {session.user && (
          <div className="flex items-center gap-1">
            <Link href="/courses" className={linkClass(false)}>
              Khóa học
            </Link>
            <Link
              href="/my-learning"
              aria-current={pathname === "/my-learning" ? "page" : undefined}
              className={linkClass(pathname === "/my-learning")}
            >
              Góc học tập
            </Link>
          </div>
        )}
        <UserMenu />
      </nav>
    </header>
  );
}
