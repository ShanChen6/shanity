"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CurrentUserAvatar } from "./current-user-avatar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { errorMessage } from "@/lib/api";
import { useSession } from "./session-provider";

export function UserHeader() {
  const session = useSession();
  const details = useRef<HTMLDetailsElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await session.logout();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
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
            <Link
              href="/courses"
              className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              Khóa học
            </Link>
            <Link
              href="/my-courses"
              className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              Khóa học của tôi
            </Link>
          </div>
        )}
        {session.user && (
          <details
            ref={details}
            className="relative min-w-0 max-w-full"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && details.current) {
                details.current.open = false;
                details.current.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              className="flex min-h-11 items-center gap-2 rounded-md p-1"
              aria-label="Mở menu tài khoản"
            >
              <CurrentUserAvatar />
              <span className="max-w-40 truncate font-medium">
                {session.user.displayName}
              </span>
              <span aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-border bg-surface p-2 shadow-md">
              <Link
                href="/profile"
                className="flex min-h-11 items-center rounded-md px-3 hover:bg-surface-hover"
                onClick={() => {
                  if (details.current) details.current.open = false;
                }}
              >
                Hồ sơ
              </Link>
              {session.user.roles.includes("instructor") && (
                <Link
                  href="/instructor/courses"
                  className="flex min-h-11 items-center rounded-md px-3 hover:bg-surface-hover"
                  onClick={() => {
                    if (details.current) details.current.open = false;
                  }}
                >
                  Instructor Portal
                </Link>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start"
                disabled={busy}
                loading={busy}
                onClick={() => void logout()}
              >
                Đăng xuất
              </Button>
            </div>
          </details>
        )}
      </nav>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </header>
  );
}
