import { BadRequestException } from '@nestjs/common';
import { CourseAccessType } from '../course-access-type.js';
import { CourseCurrency, MAX_PRICE_MINOR_UNITS } from '../course-currency.js';

export interface CoursePricingState {
  accessType: CourseAccessType;
  price: number;
  currency: CourseCurrency;
}

export interface CoursePricingInput {
  accessType: CourseAccessType;
  price?: number;
  currency?: CourseCurrency;
}

export enum PricingTransition {
  UNCHANGED = 'UNCHANGED',
  PRICE_CHANGED = 'PRICE_CHANGED',
  PAID_TO_FREE = 'PAID_TO_FREE',
  FREE_TO_PAID = 'FREE_TO_PAID',
}

/** Validates the requested pricing and returns the complete next state. */
export function resolveNextPricing(
  current: CoursePricingState,
  input: CoursePricingInput,
): CoursePricingState {
  const currency = input.currency ?? current.currency;
  if (!Object.values(CourseCurrency).includes(currency))
    throw new BadRequestException('UNSUPPORTED_CURRENCY');

  if (input.accessType === CourseAccessType.FREE) {
    if (input.price !== undefined && input.price !== 0)
      throw new BadRequestException('FREE_COURSE_PRICE_MUST_BE_ZERO');
    return { accessType: CourseAccessType.FREE, price: 0, currency };
  }

  const price = input.price;
  if (price === undefined || !Number.isSafeInteger(price) || price <= 0)
    throw new BadRequestException('PAID_COURSE_PRICE_MUST_BE_POSITIVE');
  if (price > MAX_PRICE_MINOR_UNITS[currency])
    throw new BadRequestException('COURSE_PRICE_TOO_HIGH');
  return { accessType: CourseAccessType.PAID, price, currency };
}

export function classifyTransition(
  current: CoursePricingState,
  next: CoursePricingState,
): PricingTransition {
  if (current.accessType !== next.accessType)
    return next.accessType === CourseAccessType.FREE
      ? PricingTransition.PAID_TO_FREE
      : PricingTransition.FREE_TO_PAID;
  if (current.price !== next.price || current.currency !== next.currency)
    return PricingTransition.PRICE_CHANGED;
  return PricingTransition.UNCHANGED;
}
