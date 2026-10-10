"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export type DropdownItem = {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

export function DropdownMenu({
  label,
  items,
  disabled,
  variant = "outline",
  size = "sm",
  align = "start",
  ariaLabel,
}: {
  label: ReactNode;
  items: DropdownItem[];
  disabled?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /** `end`: the menu opens leftwards from a trigger near the right edge. */
  align?: "start" | "end";
  /** For icon-only triggers. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative inline-block">
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-20 mt-1 min-w-40 rounded-md border border-border bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="block w-full whitespace-nowrap rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-hover focus-visible:bg-surface-hover disabled:opacity-50"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
