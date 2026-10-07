"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Copies text; `copied` is true for ~2s afterwards. Falls back to execCommand. */
export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // Clipboard API needs a secure context and permission; fall back.
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        field.remove();
      }
      setCopied(ok);
      setFailed(!ok);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        setFailed(false);
      }, resetMs);
      return ok;
    },
    [resetMs],
  );
  return { copy, copied, failed };
}
