"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = Exclude<ThemePreference, "system">;

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
};

const storageKey = "shanity-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);
const listeners = new Set<() => void>();

function getThemeSnapshot(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    return storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : "system";
  } catch {
    return "system";
  }
}

function getServerThemeSnapshot(): ThemePreference {
  return "system";
}

function subscribeToTheme(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function subscribeToSystemTheme(listener: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
}

function getSystemThemeSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function setThemePreference(theme: ThemePreference) {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {}
  listeners.forEach((listener) => listener());
}

function applyTheme(theme: ThemePreference) {
  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.dataset.theme = theme;
  return resolvedTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const systemDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    () => false,
  );
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    applyTheme(theme);
  }, [theme, systemDark]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme: setThemePreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
