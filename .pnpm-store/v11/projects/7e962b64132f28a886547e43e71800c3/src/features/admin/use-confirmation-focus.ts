"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";

// Native dialog makes the background inert; wrap Tab within its controls.
export function useConfirmationFocus() {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fallback = useRef<HTMLSelectElement>(null);
  const failure = useRef<HTMLParagraphElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const frame = useRef<number | null>(null);
  function unlock() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (previousOverflow.current !== null)
        document.body.style.overflow = previousOverflow.current;
    },
    [],
  );
  function open() {
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    cancel.current?.focus();
  }
  function restore() {
    unlock();
    frame.current = requestAnimationFrame(() => {
      const target = trigger.current?.disabled
        ? fallback.current
        : trigger.current;
      target?.focus({ preventScroll: true });
    });
  }
  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    const focused = document.activeElement;
    if (!first) {
      event.preventDefault();
      event.currentTarget.focus();
    } else if (
      event.shiftKey &&
      (focused === first || !controls.includes(focused as HTMLElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (focused === last || !controls.includes(focused as HTMLElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  return { dialog, cancel, trigger, fallback, failure, open, restore, trapTab };
}
