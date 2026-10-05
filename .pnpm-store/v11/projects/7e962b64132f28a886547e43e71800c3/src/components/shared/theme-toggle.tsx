"use client";

import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/providers/theme-provider";

const choices: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label="Theme preference"
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1 ${className}`}
    >
      {choices.map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          size="md"
          variant={theme === value ? "secondary" : "ghost"}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
