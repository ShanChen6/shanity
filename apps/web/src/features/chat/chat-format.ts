import { API_URL } from "@/lib/api";
import type { ChatMessage } from "./types";

/** Same guard as elsewhere: only the API's own avatar paths are loaded. */
export const avatarSrc = (path: string | null) =>
  path && /^\/avatars\/[0-9a-f-]{36}\.webp$/.test(path)
    ? `${API_URL}${path}`
    : undefined;

const time = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
});
const full = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "full",
  timeStyle: "short",
});
const short = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
const day = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

export const messageTime = (iso: string) => time.format(new Date(iso));
export const messageDateTime = (iso: string) => full.format(new Date(iso));
/** Compact, for dense lists: "01:26 10/10/2026". */
export const shortDateTime = (iso: string) => short.format(new Date(iso));

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "Hôm nay", "Hôm qua" or the full date, in the viewer's time zone. */
export function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return "Hôm nay";
  if (dayKey(date) === dayKey(yesterday)) return "Hôm qua";
  return day.format(date);
}

/** Consecutive messages of one sender within this span share one header. */
export const GROUP_WINDOW_MS = 5 * 60_000;

export type MessageRow = {
  message: ChatMessage;
  /** A day divider goes above this message. */
  dayDivider: string | null;
  /** Shows avatar and name (first of a run by the same sender). */
  showHeader: boolean;
};

export function layoutMessages(
  messages: readonly ChatMessage[],
  now = new Date(),
): MessageRow[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const sameDay =
      previous &&
      dayKey(new Date(previous.createdAt)) === dayKey(new Date(message.createdAt));
    const dayDivider = sameDay ? null : dayLabel(message.createdAt, now);
    const showHeader =
      !sameDay ||
      previous.sender.id !== message.sender.id ||
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) >
        GROUP_WINDOW_MS;
    return { message, dayDivider, showHeader };
  });
}
