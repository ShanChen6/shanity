"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

export const AUTOSAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;

export type AutoSaveStatus = "idle" | "dirty" | "syncing" | "success" | "error";

/**
 * Debounced draft autosave for one answer. Whenever `value` has been stable
 * for `delay` ms and differs from what the server last confirmed, `save` is
 * called with it. Saves never overlap: edits made while one is in flight are
 * sent right after it, so the server always ends with the newest value.
 * A failed save is retried automatically (and on `retry`). Pending edits are
 * sent on unmount, so leaving the question never drops them.
 *
 * `value` must be a stable, JSON-serializable snapshot of the answer.
 */
export function useAutoSaveAnswer<T>({
  value,
  save,
  delay = AUTOSAVE_DELAY_MS,
  enabled = true,
  initialSavedAt = null,
}: {
  value: T;
  save: (value: T) => Promise<unknown>;
  delay?: number;
  enabled?: boolean;
  initialSavedAt?: Date | null;
}) {
  const key = JSON.stringify(value);
  const debouncedKey = useDebounce(key, delay);
  // The baseline is what the server already holds (the resumed draft).
  const [savedKey, setSavedKey] = useState(key);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(initialSavedAt);

  const saveRef = useRef(save);
  const savedKeyRef = useRef(key);
  const latestKeyRef = useRef(key);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    saveRef.current = save;
    latestKeyRef.current = key;
  });

  const sync = useCallback((target: string): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (target === savedKeyRef.current) return Promise.resolve();
    if (mounted.current) {
      setSyncing(true);
      setFailed(false);
    }
    const run = (async () => {
      try {
        // Typed while saving: the newest value goes out right after.
        for (
          let next = target;
          next !== savedKeyRef.current;
          next = latestKeyRef.current
        ) {
          await saveRef.current(JSON.parse(next) as T);
          savedKeyRef.current = next;
          if (mounted.current) {
            setSavedKey(next);
            setSavedAt(new Date());
          }
        }
      } catch {
        if (mounted.current) setFailed(true);
      } finally {
        inFlight.current = null;
        if (mounted.current) setSyncing(false);
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    if (enabled && debouncedKey !== savedKeyRef.current)
      void sync(debouncedKey);
  }, [debouncedKey, enabled, sync]);

  // Automatic retry after a failure.
  useEffect(() => {
    if (!failed || !enabled) return;
    const timer = setTimeout(
      () => void sync(latestKeyRef.current),
      RETRY_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [failed, enabled, sync]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (latestKeyRef.current !== savedKeyRef.current)
        void sync(latestKeyRef.current);
    };
  }, [sync]);

  /** Sends the current value now; resolves when nothing is left unsaved. */
  const flush = useCallback(async () => {
    await inFlight.current;
    await sync(latestKeyRef.current);
  }, [sync]);
  const retry = useCallback(() => void sync(latestKeyRef.current), [sync]);

  const status: AutoSaveStatus = syncing
    ? "syncing"
    : failed
      ? "error"
      : key !== savedKey
        ? "dirty"
        : savedAt
          ? "success"
          : "idle";
  return { status, savedAt, flush, retry };
}
