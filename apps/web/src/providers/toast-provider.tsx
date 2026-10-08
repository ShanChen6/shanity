"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastCard, type ToastTone } from "@/components/ui/toast";

export type ToastOptions = {
  tone?: ToastTone;
  /** Milliseconds before it disappears; defaults by tone. */
  duration?: number;
  /** Same id = same toast: it is refreshed instead of stacking. */
  id?: string;
};

type ToastItem = {
  id: string;
  /** Bumped on every show, so a repeat remounts and restarts its timer. */
  seq: number;
  message: string;
  tone: ToastTone;
  duration: number;
};

type Toasts = {
  /** Shows a toast and returns its id. */
  toast: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: Omit<ToastOptions, "tone">) => string;
  error: (message: string, options?: Omit<ToastOptions, "tone">) => string;
  dismiss: (id: string) => void;
};

// Errors linger: they are the ones people need time to read and act on.
export const DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 5000,
  success: 4000,
  warning: 7000,
  error: 8000,
};
export const MAX_VISIBLE_TOASTS = 4;

const ToastContext = createContext<Toasts | null>(null);

export function useToast(): Toasts {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

/**
 * The app's one toast stack. Toasts auto-dismiss, but pause while the pointer
 * or keyboard focus is on them (WCAG 2.2.1: time limits must be adjustable),
 * identical messages merge, and only the newest few are shown.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const tone = options.tone ?? "info";
    const id = options.id ?? `${tone}:${message}`;
    const item: ToastItem = {
      id,
      seq: (sequence.current += 1),
      message,
      tone,
      duration: options.duration ?? DEFAULT_DURATION[tone],
    };
    setItems((current) => {
      // A repeat moves to the end; its new seq restarts the timer.
      const rest = current.filter((existing) => existing.id !== id);
      return [...rest, item].slice(-MAX_VISIBLE_TOASTS);
    });
    return id;
  }, []);

  const api = useMemo<Toasts>(
    () => ({
      toast,
      success: (message, options) =>
        toast(message, { ...options, tone: "success" }),
      error: (message, options) =>
        toast(message, { ...options, tone: "error" }),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label="Thông báo"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:w-96"
      >
        {items.map((item) => (
          <TimedToast
            key={`${item.id}#${item.seq}`}
            item={item}
            onClose={dismiss}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function TimedToast({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onClose(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [paused, item.id, item.duration, onClose]);
  return (
    <ToastCard
      message={item.message}
      tone={item.tone}
      onClose={() => onClose(item.id)}
      className="pointer-events-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    />
  );
}
