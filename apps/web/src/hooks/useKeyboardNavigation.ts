"use client";

import { useEffect } from "react";

type KeyboardNavigationOptions = {
  onPrevious?: () => void;
  onNext?: () => void;
  disabled?: boolean;
};

export function useKeyboardNavigation({
  onPrevious,
  onNext,
  disabled = false,
}: KeyboardNavigationOptions) {
  useEffect(() => {
    if (disabled) return;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isTypingTarget(event.target)) return;
      const action =
        event.key === "ArrowLeft" || event.key === "["
          ? onPrevious
          : event.key === "ArrowRight" || event.key === "]"
            ? onNext
            : undefined;
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [disabled, onNext, onPrevious]);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ),
  );
}
