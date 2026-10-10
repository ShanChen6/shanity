"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { portalsFor, userMenuNav } from "@/config/navigation.config";
import { errorMessage } from "@/lib/api";
import { CurrentUserAvatar } from "./current-user-avatar";
import { useSession } from "./session-provider";

const itemClass =
  "flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-surface-hover";

// Learning lives at /my-learning; /profile is account settings only. The
// learner pages the header leaves out (overview, attempts, orders) live here.
export function UserMenu() {
  const session = useSession();
  const details = useRef<HTMLDetailsElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    if (details.current) details.current.open = false;
  };
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
  const user = session.user;
  if (!user) return null;
  return (
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
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md p-1 hover:bg-surface-hover [&::-webkit-details-marker]:hidden"
        aria-label="Mở menu tài khoản"
      >
        <CurrentUserAvatar />
        <span className="hidden max-w-32 truncate text-sm font-semibold xl:inline">
          {user.displayName}
        </span>
        <span aria-hidden="true" className="text-muted">
          ▾
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-border bg-surface p-2 shadow-md">
        <p className="truncate px-3 pb-2 pt-1 text-xs text-muted">
          {user.email}
        </p>
        {userMenuNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={itemClass}
            onClick={close}
          >
            {item.label}
          </Link>
        ))}
        {portalsFor(user.roles)
          .filter((portal) => portal.id !== "student")
          .map((portal) => (
            <Link
              key={portal.id}
              href={portal.href}
              className={itemClass}
              onClick={close}
            >
              {portal.label}
            </Link>
          ))}
        <Button
          variant="ghost"
          className="w-full justify-start"
          disabled={busy}
          loading={busy}
          onClick={() => void logout()}
        >
          Đăng xuất
        </Button>
        {error && (
          <div className="mt-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
      </div>
    </details>
  );
}
