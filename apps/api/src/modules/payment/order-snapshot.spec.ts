import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CourseCurrency } from '../../courses/course-currency.js';
import { OrderStatus } from './entities/order.entity.js';
import {
  buildOrderSnapshot,
  extractOrderCode,
  generateOrderCode,
  toTransferContent,
  type CourseSnapshotSource,
} from './order-snapshot.js';
import { canTransitionOrder } from './order-status.js';

const course = (
  overrides: Partial<CourseSnapshotSource> = {},
): CourseSnapshotSource => ({
  id: 'course-a',
  title: 'Khóa học A',
  price: 499000,
  currency: CourseCurrency.VND,
  ...overrides,
});

describe('buildOrderSnapshot', () => {
  it('freezes title and price into plain data', () => {
    const live = course();
    const snapshot = buildOrderSnapshot([live]);

    // The course changes after checkout (T2) ...
    live.price = 799000;
    live.title = 'Khóa học A (2026 Edition)';

    // ... but the snapshot is a detached copy (T1).
    expect(snapshot).toEqual({
      currency: CourseCurrency.VND,
      subtotal: 499000,
      discountTotal: 0,
      finalTotal: 499000,
      items: [
        {
          position: 0,
          courseId: 'course-a',
          courseTitleSnapshot: 'Khóa học A',
          unitPriceSnapshot: 499000,
          discountSnapshot: 0,
          finalPriceSnapshot: 499000,
          currency: CourseCurrency.VND,
        },
      ],
    });
  });

  it('sums several courses and keeps finalTotal = subtotal - discountTotal', () => {
    const snapshot = buildOrderSnapshot([
      course(),
      course({ id: 'course-b', title: 'B', price: 300000 }),
    ]);
    expect(snapshot.subtotal).toBe(799000);
    expect(snapshot.finalTotal).toBe(
      snapshot.subtotal - snapshot.discountTotal,
    );
    expect(snapshot.items.map((item) => item.courseId)).toEqual([
      'course-a',
      'course-b',
    ]);
    for (const item of snapshot.items)
      expect(item.finalPriceSnapshot).toBe(
        item.unitPriceSnapshot - item.discountSnapshot,
      );
  });

  it.each([
    ['no courses', [], 'ORDER_REQUIRES_AT_LEAST_ONE_COURSE'],
    [
      'mixed currencies',
      [course(), course({ id: 'b', currency: CourseCurrency.USD })],
      'MIXED_CURRENCY_ORDER',
    ],
    ['a free course', [course({ price: 0 })], 'COURSE_IS_NOT_PURCHASABLE'],
    [
      'a fractional price',
      [course({ price: 10.5 })],
      'COURSE_IS_NOT_PURCHASABLE',
    ],
    [
      'an overflowing total',
      [
        course({ price: Number.MAX_SAFE_INTEGER }),
        course({ id: 'b', price: Number.MAX_SAFE_INTEGER }),
      ],
      'ORDER_TOTAL_OUT_OF_RANGE',
    ],
  ])('rejects %s', (_label, courses, message) => {
    expect(() => buildOrderSnapshot(courses)).toThrow(BadRequestException);
    expect(() => buildOrderSnapshot(courses)).toThrow(message);
  });

  it('caps the title snapshot at 255 characters without splitting emoji', () => {
    const title = '😀'.repeat(300);
    const { items } = buildOrderSnapshot([course({ title })]);
    expect(Array.from(items[0]!.courseTitleSnapshot)).toHaveLength(255);
    expect(items[0]!.courseTitleSnapshot).toBe('😀'.repeat(255));
  });
});

describe('order codes', () => {
  it('generates SHAN-YYYYMMDD-XXXX from the UTC date', () => {
    const code = generateOrderCode(
      new Date('2026-10-07T23:59:59Z'),
      (max) => max - 1,
    );
    expect(code).toBe('SHAN-20261007-9999');
    expect(generateOrderCode()).toMatch(/^SHAN-\d{8}-[A-Z2-9]{4}$/);
  });

  it('never emits ambiguous characters', () => {
    for (let index = 0; index < 500; index++)
      expect(generateOrderCode().slice(-4)).not.toMatch(/[01OI]/);
  });

  it('strips dashes for the bank transfer memo', () => {
    expect(toTransferContent('SHAN-20261007-X89K')).toBe('SHAN20261007X89K');
  });

  it.each([
    ['SHAN20261007X89K', 'SHAN-20261007-X89K'],
    ['SHAN-20261007-X89K', 'SHAN-20261007-X89K'],
    ['nguyen van a chuyen tien shan20261007x89k cam on', 'SHAN-20261007-X89K'],
    ['MBVCB.123.SHAN 20261007 X89K.CT tu 0123', 'SHAN-20261007-X89K'],
    ['PAY SHAN20261007X89KTHANHTOAN', 'SHAN-20261007-X89K'],
  ])('extracts %j', (memo, expected) => {
    expect(extractOrderCode(memo)).toBe(expected);
  });

  it('still recognises pre-PAY3 codes and rejects memos without one', () => {
    expect(extractOrderCode('PAY SHANABC234')).toBe('SHANABC234');
    expect(extractOrderCode('chuyen khoan hoc phi')).toBeNull();
  });

  it('round-trips every generated code through the transfer memo', () => {
    for (let index = 0; index < 200; index++) {
      const code = generateOrderCode();
      expect(extractOrderCode(`CK ${toTransferContent(code)}`)).toBe(code);
    }
  });
});

describe('canTransitionOrder', () => {
  it('allows only the documented transitions', () => {
    const allowed: Array<[OrderStatus, OrderStatus]> = [
      [OrderStatus.PENDING, OrderStatus.PROCESSING],
      [OrderStatus.PENDING, OrderStatus.COMPLETED],
      [OrderStatus.PENDING, OrderStatus.EXPIRED],
      [OrderStatus.PENDING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING, OrderStatus.COMPLETED],
      [OrderStatus.PROCESSING, OrderStatus.EXPIRED],
      [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.EXPIRED, OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED, OrderStatus.REFUNDED],
    ];
    const all = Object.values(OrderStatus);
    for (const from of all)
      for (const to of all)
        expect(canTransitionOrder(from, to)).toBe(
          allowed.some(([a, b]) => a === from && b === to),
        );
  });
});
