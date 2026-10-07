/** Ledger and order columns hold safe-integer numbers; providers speak bigint. */
export const toMinorUnits = (value: number): bigint => {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`${value} is not a safe integer amount`);
  return BigInt(value);
};

export const fromMinorUnits = (value: bigint): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new RangeError(`${value} does not fit a safe integer amount`);
  return parsed;
};
