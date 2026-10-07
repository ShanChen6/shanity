import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Compares secrets without leaking their length or matching prefix. */
export function safeEqual(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

export const hmacSha256Hex = (secret: string, data: Buffer | string) =>
  createHmac('sha256', secret).update(data).digest('hex');
