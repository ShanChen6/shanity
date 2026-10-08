"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useSession } from "@/features/auth/session-provider";
import {
  adminNav,
  isNavActive,
  navigationFor,
} from "@/config/navigation.config";

export function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  return (
    <nav aria-label="Điều hướng quản trị" className="space-y-1">
      {navigationFor(adminNav, user?.roles ?? []).map((item) => {
        const { href, label, icon } = item;
        const active = isNavActive(pathname, item);
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-secondary text-secondary-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
          >
            <Icon name={icon} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
