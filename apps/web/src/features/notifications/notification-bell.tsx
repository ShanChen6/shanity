"use client";

import Link from "next/link";
import { useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { useNotifications } from "./use-notifications";

/** Header bell: a count badge and a list of what is waiting on the user. */
export function NotificationBell() {
  const { items, isPending } = useNotifications();
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (details.current) details.current.open = false;
  };
  const count = items.length;
  return (
    <details
      ref={details}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={
          count > 0 ? `Thông báo, ${count} mục cần xử lý` : "Thông báo"
        }
        className="relative flex size-11 cursor-pointer list-none items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        <Icon name="bell" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger-foreground px-1 text-[0.625rem] font-bold leading-4 text-danger-background"
          >
            {count}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 shadow-md">
        <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">
          Việc cần xử lý
        </p>
        {isPending ? (
          <p role="status" className="px-3 py-4 text-sm text-muted">
            Đang kiểm tra…
          </p>
        ) : count === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            Bạn đã xử lý hết mọi việc.
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="block rounded-md px-3 py-2.5 hover:bg-surface-hover"
                >
                  <span className="block text-sm font-medium">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="mt-0.5 block text-xs text-muted">
                      {item.description}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
