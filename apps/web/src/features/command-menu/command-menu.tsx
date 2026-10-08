"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon, type IconName } from "@/components/ui/icon";
import { portalsFor, searchableNavigation } from "@/config/navigation.config";
import { useSession } from "@/features/auth/session-provider";
import type { CatalogCourse } from "@/features/courses/catalog-types";
import { useDebounce } from "@/hooks/useDebounce";
import { apiPage } from "@/lib/api";
import { useTheme } from "@/providers/theme-provider";
import { rank } from "./search";

type Command = {
  id: string;
  label: string;
  group: string;
  icon: IconName;
  keywords?: readonly string[];
  /** Shown to the right of the label. */
  hint?: string;
  href?: string;
  run?: () => void | Promise<void>;
};

type Menu = { setOpen: (open: boolean) => void };
const MenuContext = createContext<Menu | null>(null);

export function useCommandMenu(): Menu {
  const menu = useContext(MenuContext);
  if (!menu)
    throw new Error("useCommandMenu must be used inside CommandMenuProvider");
  return menu;
}

/** Owns the Cmd/Ctrl+K shortcut and mounts the palette while it is open. */
export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // Claim the shortcut even from a text field: it is the browser's
        // "focus address bar" key on some platforms.
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const menu = useMemo(() => ({ setOpen }), []);
  return (
    <MenuContext.Provider value={menu}>
      {children}
      {open && <CommandMenu onClose={() => setOpen(false)} />}
    </MenuContext.Provider>
  );
}

const subscribeNothing = () => () => {};
const isApplePlatform = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** The header's search field look-alike. */
export function CommandMenuTrigger({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Icon only on tablets, shortcut from xl, and the label only on 2xl. */
  compact?: boolean;
}) {
  const { setOpen } = useCommandMenu();
  // Server and first client render agree (Ctrl); a Mac swaps to the glyph after.
  const apple = useSyncExternalStore(
    subscribeNothing,
    isApplePlatform,
    () => false,
  );
  return (
    <button
      type="button"
      aria-label="Tìm nhanh"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      onClick={() => setOpen(true)}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-muted hover:bg-surface-hover hover:text-foreground ${className}`}
    >
      <Icon name="search" className="size-4" />
      <span className={compact ? "hidden 2xl:inline" : "hidden sm:inline"}>
        Tìm nhanh…
      </span>
      <kbd
        className={`hidden rounded border border-border-strong px-1.5 py-0.5 font-mono text-xs ${
          compact ? "xl:inline" : "md:inline"
        }`}
      >
        {apple ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

const ANONYMOUS_COMMANDS: Command[] = [
  {
    id: "nav:/courses",
    label: "Khóa học",
    group: "Điều hướng",
    icon: "search",
    href: "/courses",
  },
  {
    id: "nav:/login",
    label: "Đăng nhập",
    group: "Điều hướng",
    icon: "user",
    href: "/login",
  },
  {
    id: "nav:/register",
    label: "Tạo tài khoản",
    group: "Điều hướng",
    icon: "user",
    href: "/register",
  },
];

function useBaseCommands(): Command[] {
  const { user, logout } = useSession();
  const { setTheme } = useTheme();
  return useMemo(() => {
    const theme: Command[] = [
      {
        id: "theme:light",
        label: "Giao diện sáng",
        group: "Giao diện",
        icon: "sun",
        keywords: ["theme", "light"],
        run: () => setTheme("light"),
      },
      {
        id: "theme:dark",
        label: "Giao diện tối",
        group: "Giao diện",
        icon: "moon",
        keywords: ["theme", "dark"],
        run: () => setTheme("dark"),
      },
      {
        id: "theme:system",
        label: "Giao diện theo hệ thống",
        group: "Giao diện",
        icon: "settings",
        keywords: ["theme", "system"],
        run: () => setTheme("system"),
      },
    ];
    if (!user) return [...ANONYMOUS_COMMANDS, ...theme];
    const navigation: Command[] = searchableNavigation(user.roles).map(
      (item) => ({
        id: `nav:${item.href}`,
        label: item.label,
        group:
          item.href.startsWith("/instructor/courses/new") ||
          item.href.startsWith("/instructor/quizzes/create")
            ? "Tạo mới"
            : "Điều hướng",
        icon: item.icon,
        keywords: item.keywords,
        hint: item.href,
        href: item.href,
      }),
    );
    const portals: Command[] = portalsFor(user.roles)
      .filter((portal) => portal.id !== "student")
      .map((portal) => ({
        id: `portal:${portal.id}`,
        label: `Chuyển tới ${portal.label.toLowerCase()}`,
        group: "Chuyển không gian",
        icon: portal.icon,
        keywords: ["portal", "workspace"],
        href: portal.href,
      }));
    const account: Command[] = [
      {
        id: "account:logout",
        label: "Đăng xuất",
        group: "Tài khoản",
        icon: "logout",
        keywords: ["logout", "thoát"],
        run: () => logout(),
      },
    ];
    return [...navigation, ...portals, ...theme, ...account];
  }, [user, logout, setTheme]);
}

function useCourseResults(query: string): Command[] {
  const term = useDebounce(query.trim(), 250);
  const courses = useQuery({
    queryKey: ["command-menu", "courses", term],
    queryFn: ({ signal }) =>
      apiPage<CatalogCourse>(
        `/api/v1/public/courses?${new URLSearchParams({ search: term, page: "1", limit: "5" })}`,
        { signal },
        false,
      ),
    enabled: term.length >= 2,
    staleTime: 30_000,
    retry: false,
  });
  // `term` lags the input by the debounce; never show results for old text.
  if (term !== query.trim() || !courses.data) return [];
  return courses.data.data.map((course) => ({
    id: `course:${course.id}`,
    label: course.title,
    group: "Khóa học",
    icon: "book",
    hint: course.instructor?.displayName,
    href: `/courses/${course.slug}`,
  }));
}

function CommandMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const base = useBaseCommands();
  const courses = useCourseResults(query);

  const results = useMemo(
    () => [...rank(base, query), ...courses],
    [base, query, courses],
  );
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const activeId = results[activeIndex]
    ? `${listId}-${results[activeIndex].id}`
    : undefined;

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof element?.showModal === "function") element.showModal();
    else element?.setAttribute("open", "");
    return () => {
      if (element?.open) element.close?.();
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    document
      .getElementById(activeId ?? "")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const choose = useCallback(
    (command: Command) => {
      onClose();
      if (command.href) router.push(command.href);
      else void command.run?.();
    },
    [onClose, router],
  );

  function onKeyDown(event: ReactKeyboardEvent) {
    const last = results.length - 1;
    const move = (next: number) => {
      event.preventDefault();
      setActive(next);
    };
    if (event.key === "ArrowDown")
      move(activeIndex >= last ? 0 : activeIndex + 1);
    else if (event.key === "ArrowUp")
      move(activeIndex <= 0 ? Math.max(last, 0) : activeIndex - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(Math.max(last, 0));
    else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  // Group while keeping the flat order the keyboard walks through.
  const groups: Array<{ title: string; items: Command[] }> = [];
  for (const command of results) {
    const group = groups.find(({ title }) => title === command.group);
    if (group) group.items.push(command);
    else groups.push({ title: command.group, items: [command] });
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Tìm nhanh"
      className="m-0 mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Icon name="search" className="size-5 text-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Gõ để tìm trang, khóa học hoặc hành động"
          placeholder="Tìm trang, khóa học, hành động…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          className="min-h-14 w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
        />
        <kbd className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-xs text-muted">
          Esc
        </kbd>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Kết quả"
        className="max-h-[60vh] overflow-y-auto p-2"
      >
        {groups.map((group, groupIndex) => (
          <div
            key={group.title}
            role="group"
            aria-labelledby={`${listId}-g-${groupIndex}`}
          >
            <p
              id={`${listId}-g-${groupIndex}`}
              className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted"
            >
              {group.title}
            </p>
            {group.items.map((command) => {
              const index = results.indexOf(command);
              const selected = index === activeIndex;
              return (
                <div
                  key={command.id}
                  id={`${listId}-${command.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(command)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm ${
                    selected
                      ? "bg-secondary text-secondary-foreground"
                      : "text-foreground"
                  }`}
                >
                  <Icon name={command.icon} className="size-4" />
                  <span className="min-w-0 flex-1 truncate">
                    {command.label}
                  </span>
                  {command.hint && (
                    <span className="hidden truncate text-xs text-muted sm:inline">
                      {command.hint}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {results.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted">
            Không tìm thấy kết quả cho “{query.trim()}”.
          </p>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {results.length} kết quả
      </p>
      <p className="hidden border-t border-border px-4 py-2 text-xs text-muted sm:block">
        ↑↓ để chọn · Enter để mở · Esc để đóng
      </p>
    </dialog>
  );
}
