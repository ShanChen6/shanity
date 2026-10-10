"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { useSession } from "@/features/auth/session-provider";

/** "Viết bài" on the public blog, for the people who can write: admins and instructors. */
export function WriteLink() {
  const { user } = useSession();
  const href = user?.roles.includes("admin")
    ? "/admin/blog/new"
    : user?.roles.includes("instructor")
      ? "/instructor/blog/new"
      : null;
  if (!href) return null;
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
    >
      <PenLine aria-hidden className="size-4" /> Viết bài
    </Link>
  );
}
