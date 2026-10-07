import { formatMoney } from "./format";

// Mirrors admin-orders.dto.ts: the API stays the authority, this only spares a
// round trip and tells staff what to fix.
export const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{3,99}$/;
export const MIN_JUSTIFICATION = 10;
export const MAX_JUSTIFICATION = 2000;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

const DIGITS = /^\d{1,15}$/;

/** Whole minor units typed as digits; null when not a positive safe integer. */
export function parseAmount(value: string): number | null {
  const text = value.trim();
  if (!DIGITS.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function transactionIdError(value: string): string | null {
  return TRANSACTION_ID_PATTERN.test(value.trim())
    ? null
    : "Mã giao dịch gồm 4–100 ký tự: chữ, số và . _ : / -";
}

export function receivedAmountError(
  value: string,
  orderTotal: number,
  currency: string,
): string | null {
  const amount = parseAmount(value);
  if (amount === null) return "Nhập số tiền là số nguyên dương.";
  return amount < orderTotal
    ? `Số tiền nhận phải từ ${formatMoney(orderTotal, currency)} trở lên.`
    : null;
}

export function refundAmountError(
  value: string,
  refundable: number,
  currency: string,
): string | null {
  const amount = parseAmount(value);
  if (amount === null) return "Nhập số tiền hoàn là số nguyên dương.";
  return amount > refundable
    ? `Số tiền hoàn tối đa là ${formatMoney(refundable, currency)}.`
    : null;
}

export function justificationError(value: string, noun: string): string | null {
  const length = value.trim().length;
  if (length < MIN_JUSTIFICATION)
    return `${noun} cần ít nhất ${MIN_JUSTIFICATION} ký tự (hiện có ${length}).`;
  return length > MAX_JUSTIFICATION
    ? `${noun} tối đa ${MAX_JUSTIFICATION} ký tự.`
    : null;
}

export function proofFileError(file: File): string | null {
  if (!(PROOF_TYPES as readonly string[]).includes(file.type))
    return "Chứng từ phải là ảnh PNG, JPG, WebP hoặc tệp PDF.";
  if (file.size === 0) return "Tệp chứng từ trống.";
  if (file.size > MAX_PROOF_BYTES)
    return "Chứng từ quá lớn. Vui lòng chọn tệp tối đa 5 MB.";
  return null;
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
