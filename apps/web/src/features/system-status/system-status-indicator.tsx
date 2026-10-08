"use client";

import { SYSTEM_STATE_COPY, useSystemStatus } from "./use-system-status";

/** The footer's status dot. Text carries the meaning; colour only reinforces it. */
export function SystemStatusIndicator() {
  const { state } = useSystemStatus();
  const { label, dot } = SYSTEM_STATE_COPY[state];
  return (
    <p
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-body-sm text-muted"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {label}
    </p>
  );
}
