import type { ValueTransformer } from 'typeorm';

// node-postgres returns bigint as string. Money amounts stay within
// Number.MAX_SAFE_INTEGER (see MAX_PRICE_MINOR_UNITS), so they are exposed as
// numbers and any unsafe value fails loudly instead of losing precision.
export const bigintNumberTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return value;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed))
      throw new RangeError(
        `bigint value ${String(value)} is not a safe integer`,
      );
    return parsed;
  },
};
