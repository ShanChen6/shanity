import { CourseAccessType } from '../course-access-type.js';
import { CourseCurrency } from '../course-currency.js';
import {
  classifyTransition,
  PricingTransition,
  resolveNextPricing,
  type CoursePricingState,
} from './course-pricing.rules.js';

const paid: CoursePricingState = {
  accessType: CourseAccessType.PAID,
  price: 500000,
  currency: CourseCurrency.VND,
};
const free: CoursePricingState = {
  accessType: CourseAccessType.FREE,
  price: 0,
  currency: CourseCurrency.VND,
};

describe('resolveNextPricing', () => {
  it('normalizes FREE to price 0 and keeps the current currency', () => {
    expect(
      resolveNextPricing(paid, { accessType: CourseAccessType.FREE }),
    ).toEqual(free);
  });

  it.each([
    [{ accessType: CourseAccessType.FREE, price: 100 }, 'FREE_COURSE_PRICE_MUST_BE_ZERO'],
    [{ accessType: CourseAccessType.PAID }, 'PAID_COURSE_PRICE_MUST_BE_POSITIVE'],
    [{ accessType: CourseAccessType.PAID, price: 0 }, 'PAID_COURSE_PRICE_MUST_BE_POSITIVE'],
    [{ accessType: CourseAccessType.PAID, price: -5 }, 'PAID_COURSE_PRICE_MUST_BE_POSITIVE'],
    [{ accessType: CourseAccessType.PAID, price: 19.99 }, 'PAID_COURSE_PRICE_MUST_BE_POSITIVE'],
    [{ accessType: CourseAccessType.PAID, price: 20_000_000_000 }, 'COURSE_PRICE_TOO_HIGH'],
    [
      { accessType: CourseAccessType.PAID, price: 100_000_001, currency: CourseCurrency.USD },
      'COURSE_PRICE_TOO_HIGH',
    ],
  ])('rejects %j', (input, message) => {
    expect(() => resolveNextPricing(free, input)).toThrow(message);
  });

  it('stores USD as integer cents', () => {
    expect(
      resolveNextPricing(free, {
        accessType: CourseAccessType.PAID,
        price: 1999,
        currency: CourseCurrency.USD,
      }),
    ).toEqual({
      accessType: CourseAccessType.PAID,
      price: 1999,
      currency: CourseCurrency.USD,
    });
  });
});

describe('classifyTransition', () => {
  it('classifies every transition', () => {
    expect(classifyTransition(paid, paid)).toBe(PricingTransition.UNCHANGED);
    expect(classifyTransition(paid, { ...paid, price: 1 })).toBe(
      PricingTransition.PRICE_CHANGED,
    );
    expect(
      classifyTransition(paid, { ...paid, currency: CourseCurrency.USD }),
    ).toBe(PricingTransition.PRICE_CHANGED);
    expect(classifyTransition(paid, free)).toBe(PricingTransition.PAID_TO_FREE);
    expect(classifyTransition(free, paid)).toBe(PricingTransition.FREE_TO_PAID);
  });
});
