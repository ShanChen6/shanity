"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { breadcrumbsFor, type Crumb } from "@/config/breadcrumbs";
import { cn } from "@/lib/utils";

type Overrides = Readonly<Record<string, string>>;
type Registry = {
  overrides: Overrides;
  set: (href: string, label: string) => void;
};
const BreadcrumbContext = createContext<Registry | null>(null);

/** Lets a page replace a generic crumb ("Chi tiết") with its real title. */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const registry = useMemo<Registry>(
    () => ({
      overrides,
      set: (href, label) =>
        setOverrides((current) =>
          current[href] === label ? current : { ...current, [href]: label },
        ),
    }),
    [overrides],
  );
  return (
    <BreadcrumbContext.Provider value={registry}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/** Renders nothing; names the crumb for `href` once the page knows its title. */
export function BreadcrumbLabel({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const registry = useContext(BreadcrumbContext);
  const set = registry?.set;
  useEffect(() => {
    set?.(href, label);
  }, [set, href, label]);
  return null;
}

export type BreadcrumbsProps = {
  /** A leading crumb outside the URL, e.g. "Trang chủ" -> "/". */
  root?: { label: string; href: string };
  /** Replaces the URL-derived trail (the admin console keeps list filters). */
  items?: readonly Crumb[];
  /** Keep a lone crumb: consoles use it as the page's title. */
  alwaysShow?: boolean;
  className?: string;
};

export function Breadcrumbs({
  root,
  items,
  alwaysShow = false,
  className = "",
}: BreadcrumbsProps) {
  const pathname = usePathname();
  const registry = useContext(BreadcrumbContext);
  const trail = useMemo<Crumb[]>(() => {
    const derived = items ?? breadcrumbsFor(pathname, registry?.overrides);
    return root
      ? [
          {
            href: root.href,
            label: root.label,
            current: false,
            linkable: true,
          },
          ...derived,
        ]
      : [...derived];
  }, [items, pathname, registry?.overrides, root]);
  // A single crumb is just the page title again.
  if (trail.length < (alwaysShow ? 1 : 2)) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-muted">
                /
              </span>
            )}
            {crumb.current ? (
              <span aria-current="page" className="font-medium">
                {crumb.label}
              </span>
            ) : crumb.linkable ? (
              <Link href={crumb.href} className="text-muted hover:text-primary">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-muted">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
