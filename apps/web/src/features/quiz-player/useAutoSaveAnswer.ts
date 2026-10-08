"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { clearLocalDraft, writeLocalDraft } from "./local-draft";

export const AUTOSAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;

export type AutoSaveStatus =
  | "idle"
  | "dirty"
  | "syncing"
  | "success"
  | "offline"
  | "error";

/**
 * Debounced draft autosave for one answer. Whenever `value` has been stable
 * for `delay` ms and differs from what the server last confirmed, `save` is
 * called with it. Saves never overlap: edits made while one is in flight are
 * sent right after it, so the server always ends with the newest value.
 * A failed save is retried automatically (and on `retry`). Pending edits are
 * sent on unmount, so leaving the question never drops them.
 *
 * Offline: nothing is sent, the unconfirmed value is mirrored to localStorage
 * under `storageKey` (and removed once the server confirms it), and the
 * newest value is sent the moment the connection returns.
 *
 * `baseline` is what the server already holds. It defaults to the first
 * `value`; pass it when `value` starts from a restored local draft so that
 * draft counts as unsaved. `value` must be a stable, JSON-serializable
 * snapshot of the answer.
 */
export function useAutoSaveAnswer<T>({
  value,
  baseline,
  save,
  delay = AUTOSAVE_DELAY_MS,
  enabled = true,
  initialSavedAt = null,
  storageKey,
}: {
  value: T;
  baseline?: T;
  save: (value: T) => Promise<unknown>;
  delay?: number;
  enabled?: boolean;
  initialSavedAt?: Date | null;
  storageKey?: string;
}) {
  const key = JSON.stringify(value);
  const debouncedKey = useDebounce(key, delay);
  const online = useOnlineStatus();
  // The baseline is what the server already holds (the resumed draft).
  const [initialKey] = useState(() =>
    baseline === undefined ? key : JSON.stringify(baseline),
  );
  const [savedKey, setSavedKey] = useState(initialKey);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(initialSavedAt);

  const saveRef = useRef(save);
  const savedKeyRef = useRef(initialKey);
  const latestKeyRef = useRef(key);
  const onlineRef = useRef(online);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    saveRef.current = save;
    latestKeyRef.current = key;
    onlineRef.current = online;
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

  // Mirror what the server has not confirmed to this device.
  useEffect(() => {
    if (!storageKey) return;
    if (key === savedKey) clearLocalDraft(storageKey);
    else writeLocalDraft(storageKey, value);
    // `value` is rebuilt every render; its content is `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, savedKey, storageKey]);

  useEffect(() => {
    if (enabled && online && debouncedKey !== savedKeyRef.current)
      void sync(debouncedKey);
  }, [debouncedKey, enabled, online, sync]);

  // The connection is back: send the newest value without waiting.
  useEffect(() => {
    if (enabled && online && latestKeyRef.current !== savedKeyRef.current)
      void sync(latestKeyRef.current);
  }, [online, enabled, sync]);

  // Automatic retry after a failure (while there is a connection to try).
  useEffect(() => {
    if (!failed || !enabled || !online) return;
    const timer = setTimeout(
      () => void sync(latestKeyRef.current),
      RETRY_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [failed, enabled, online, sync]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (
        onlineRef.current &&
        latestKeyRef.current !== savedKeyRef.current
      )
        void sync(latestKeyRef.current);
    };
  }, [sync]);

  /** Sends the current value now; resolves when nothing is left unsaved. */
  const flush = useCallback(async () => {
    await inFlight.current;
    await sync(latestKeyRef.current);
  }, [sync]);
  const retry = useCallback(() => void sync(latestKeyRef.current), [sync]);

  const dirty = key !== savedKey;
  const status: AutoSaveStatus = syncing
    ? "syncing"
    : !online && (dirty || failed)
      ? "offline"
      : failed
        ? "error"
        : dirty
          ? "dirty"
          : savedAt
            ? "success"
            : "idle";
  return { status, savedAt, flush, retry, online };
}
