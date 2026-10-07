export enum CourseCurrency {
  VND = 'VND',
  USD = 'USD',
}

export const DEFAULT_COURSE_CURRENCY = CourseCurrency.VND;

// Prices are raw integers in the currency's minor unit: VND has no minor unit
// (500000 = 500.000 ₫) while USD is stored in cents (1999 = $19.99).
export const MAX_PRICE_MINOR_UNITS: Readonly<Record<CourseCurrency, number>> = {
  [CourseCurrency.VND]: 10_000_000_000,
  [CourseCurrency.USD]: 100_000_000,
};
