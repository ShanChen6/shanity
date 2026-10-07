import { BadRequestException } from '@nestjs/common';

export interface BankTransfer {
  transactionId: string;
  amount: number;
  transferContent: string;
  /** When the bank booked the transfer, if the forwarder says so. */
  paidAt?: Date;
  /** false for debits (money leaving the account), which never settle orders. */
  incoming: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : null;

/**
 * Normalises a bank notification. Two shapes are accepted:
 * - native:  { transactionId, amount, transferContent }
 * - SePay:   { id, referenceCode, transferType: 'in'|'out', transferAmount, content }
 * Anything else, or a field outside the persisted limits, is a 400.
 */
export function parseBankTransfer(payload: unknown): BankTransfer {
  if (!isRecord(payload))
    throw new BadRequestException('INVALID_NOTIFICATION_PAYLOAD');

  const sepay = 'transferAmount' in payload || 'transferType' in payload;
  const transactionId = sepay
    ? (text(payload.referenceCode, 100) ??
      text(
        typeof payload.id === 'number' ? String(payload.id) : payload.id,
        100,
      ))
    : text(payload.transactionId, 100);
  const amount = positiveInteger(
    sepay ? payload.transferAmount : payload.amount,
  );
  const transferContent = text(
    sepay ? (payload.content ?? payload.description) : payload.transferContent,
    500,
  );
  if (!transactionId || amount === null || !transferContent)
    throw new BadRequestException('INVALID_NOTIFICATION_PAYLOAD');

  return {
    transactionId,
    amount,
    transferContent,
    paidAt: sepay ? parseVietnamTime(payload.transactionDate) : undefined,
    incoming: sepay ? payload.transferType === 'in' : true,
  };
}

/** SePay sends "YYYY-MM-DD HH:mm:ss" in Vietnam time (UTC+7). */
function parseVietnamTime(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value);
  if (!match) return undefined;
  const parsed = new Date(`${match[1]}T${match[2]}+07:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
