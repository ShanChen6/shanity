export { formatDateTime, formatMoney } from "@/features/payments/format";

const withSeconds = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Audit and ledger times keep the seconds: they are evidence. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : withSeconds.format(date);
}

/** Pretty JSON for display. Always rendered as text, never as HTML. */
export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return "Không thể hiển thị dữ liệu.";
  }
}
