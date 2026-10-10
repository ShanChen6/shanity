import type { LiveSession, LiveStatus } from "./types";

/**
 * serverNow = Date.now() + offset. Measured when a response arrives, so a
 * learner's wrong system clock neither opens the class early nor late.
 */
export const clockOffset = (serverTime: string, receivedAt = Date.now()) =>
  Date.parse(serverTime) - receivedAt;

/** The phase the page shows at `serverNow` (the server confirms on refetch). */
export function phaseAt(
  session: Pick<LiveSession, "status" | "startTime" | "endTime">,
  serverNow: number,
): LiveStatus {
  if (session.status === "CANCELLED") return "CANCELLED";
  if (session.status === "ENDED" || serverNow >= Date.parse(session.endTime)) return "ENDED";
  if (serverNow >= Date.parse(session.startTime)) return "LIVE";
  return "SCHEDULED";
}

export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number };

/** Whole seconds left, never negative, split for display. */
export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const two = (value: number) => String(value).padStart(2, "0");

/** "00:14:59", or "2 ngày 03:00:00" when more than a day away. */
export function formatCountdown(ms: number) {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const clock = `${two(hours)}:${two(minutes)}:${two(seconds)}`;
  return days ? `${days} ngày ${clock}` : clock;
}
