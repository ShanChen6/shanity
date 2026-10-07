"use client";

import { useMemo } from "react";
import { useNow } from "./use-now";

/**
 * Milliseconds left until `expiresAt` on the server's clock (`offsetMs` =
 * serverNow - clientNow), re-rendered every second until it reaches zero
 * (the interval is then stopped, and cleared on unmount).
 */
export function useCountdown(expiresAt: string | null, offsetMs = 0) {
  const deadline = useMemo(
    () => (expiresAt ? new Date(expiresAt).getTime() : null),
    [expiresAt],
  );
  const valid = deadline !== null && !Number.isNaN(deadline);
  const now = useNow(valid ? 1000 : null);
  const remainingMs = valid ? Math.max(0, deadline - (now + offsetMs)) : 0;
  return { remainingMs, expired: valid && remainingMs <= 0 };
}
