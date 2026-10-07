/** Gateways the platform can settle money through (mirrors the DB enum). */
export enum PaymentProviderEnum {
  VIETQR = 'VIETQR',
  STRIPE = 'STRIPE',
  MOMO = 'MOMO',
  VNPAY = 'VNPAY',
  MANUAL_BANK = 'MANUAL_BANK',
}

/**
 * What a provider reports about one payment attempt. This is the provider's
 * view; the order/ledger statuses are derived from it by the core domain.
 */
export enum PaymentStatusEnum {
  /** Nothing to settle yet (not paid, or an event we do not act on). */
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}
