"use client";

import { Icon } from "@/components/ui/icon";
import { useTheme, type ThemePreference } from "@/providers/theme-provider";

const ORDER: ThemePreference[] = ["light", "dark", "system"];
const NAME: Record<ThemePreference, string> = {
  light: "sáng",
  dark: "tối",
  system: "theo hệ thống",
};

/** One-button theme switch for dense headers: light, dark, then system. */
export function ThemeCycleButton({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Giao diện ${NAME[theme]}. Chuyển sang giao diện ${NAME[next]}`}
      title={`Giao diện ${NAME[theme]}`}
      className={`flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground ${className}`}
    >
      <Icon name={resolvedTheme === "dark" ? "moon" : "sun"} />
    </button>
  );
}
