/**
 * Money is an integer in the currency's minor unit: VND dong, USD cents.
 * VND -> "499.000 ₫", USD 1999 -> "$19.99".
 */
export function formatMoney(amount: number, currency: string): string {
  if (currency === "USD")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  if (currency === "VND")
    return `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ${currency}`;
}

/** Plain digits for pasting into a banking app (no separators or symbol). */
export function plainAmount(amount: number, currency: string): string {
  return currency === "USD" ? (amount / 100).toFixed(2) : String(amount);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** 125000 -> "02:05". Never negative. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
