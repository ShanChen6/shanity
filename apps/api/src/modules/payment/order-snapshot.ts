import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { CourseCurrency } from '../../courses/course-currency.js';
import type { Course } from '../../courses/course.entity.js';

export const ORDER_TTL_MS = 15 * 60_000;
export const MAX_ORDER_ITEMS = 20;
/** Unpaid, unexpired orders one buyer may hold (anti-exhaustion of order codes). */
export const MAX_PENDING_ORDERS_PER_USER = 10;
const TITLE_SNAPSHOT_MAX = 255;

/** The only Course fields an order is allowed to read at checkout. */
export type CourseSnapshotSource = Pick<
  Course,
  'id' | 'title' | 'price' | 'currency'
>;

export interface OrderItemSnapshot {
  position: number;
  courseId: string;
  courseTitleSnapshot: string;
  unitPriceSnapshot: number;
  discountSnapshot: number;
  finalPriceSnapshot: number;
  currency: CourseCurrency;
}

export interface OrderSnapshot {
  currency: CourseCurrency;
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  items: OrderItemSnapshot[];
}

const sum = (values: readonly number[]) => {
  const total = values.reduce((acc, value) => acc + value, 0);
  if (!Number.isSafeInteger(total))
    throw new BadRequestException('ORDER_TOTAL_OUT_OF_RANGE');
  return total;
};

/**
 * Freezes the checkout-time title and price of every course into plain data.
 * Everything downstream (order header, items, QR amount, webhook matching)
 * derives from this object; nothing re-reads `courses` afterwards.
 */
export function buildOrderSnapshot(
  courses: readonly CourseSnapshotSource[],
): OrderSnapshot {
  if (courses.length === 0)
    throw new BadRequestException('ORDER_REQUIRES_AT_LEAST_ONE_COURSE');
  const currency = courses[0]!.currency;
  if (courses.some((course) => course.currency !== currency))
    throw new BadRequestException('MIXED_CURRENCY_ORDER');

  const items = courses.map((course, position): OrderItemSnapshot => {
    if (!Number.isSafeInteger(course.price) || course.price <= 0)
      throw new BadRequestException('COURSE_IS_NOT_PURCHASABLE');
    const discountSnapshot = 0;
    return {
      position,
      courseId: course.id,
      // Count code points, not UTF-16 units, so a cut never splits a pair.
      courseTitleSnapshot: Array.from(course.title)
        .slice(0, TITLE_SNAPSHOT_MAX)
        .join(''),
      unitPriceSnapshot: course.price,
      discountSnapshot,
      finalPriceSnapshot: course.price - discountSnapshot,
      currency,
    };
  });

  const subtotal = sum(items.map((item) => item.unitPriceSnapshot));
  const discountTotal = sum(items.map((item) => item.discountSnapshot));
  return {
    currency,
    subtotal,
    discountTotal,
    finalTotal: subtotal - discountTotal,
    items,
  };
}

// Visually ambiguous characters (0/O, 1/I) are excluded.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LENGTH = 4;

/** SHAN-YYYYMMDD-XXXX (UTC date). Uniqueness is enforced by orders_code_key. */
export function generateOrderCode(
  now: Date = new Date(),
  pick: (max: number) => number = randomInt,
) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  let suffix = '';
  for (let index = 0; index < CODE_SUFFIX_LENGTH; index++)
    suffix += CODE_ALPHABET[pick(CODE_ALPHABET.length)];
  return `SHAN-${date}-${suffix}`;
}

/** Banks routinely strip punctuation, so the QR memo carries no dashes. */
export const toTransferContent = (code: string) => code.replaceAll('-', '');

const CURRENT_CODE = /SHAN[-\s]?(\d{8})[-\s]?([A-Z0-9]{4})/;
// Orders created before PAY3 used SHAN + 6 characters.
const LEGACY_CODE = /SHAN[A-Z0-9]+/;

/** Recovers the canonical order code from a free-text bank transfer memo. */
export function extractOrderCode(transferContent: string): string | null {
  const text = transferContent.toUpperCase();
  const current = CURRENT_CODE.exec(text);
  if (current) return `SHAN-${current[1]}-${current[2]}`;
  return LEGACY_CODE.exec(text)?.[0] ?? null;
}
