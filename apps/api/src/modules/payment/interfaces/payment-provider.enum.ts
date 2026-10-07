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

/**
 * Ledger-only provider: money a back-office user reconciled by hand after the
 * gateway notification was lost. It is never a checkout choice and has no
 * adapter, which is why it is not a PaymentProviderEnum member; it exists in
 * the database enum so such a payment is recognisable on the ledger.
 */
export const MANUAL_RECONCILED = 'MANUAL_RECONCILED' as const;

/** Every value the payment ledger's `provider` column can hold. */
export type LedgerProvider = PaymentProviderEnum | typeof MANUAL_RECONCILED;
export const LEDGER_PROVIDERS: readonly LedgerProvider[] = [
  ...Object.values(PaymentProviderEnum),
  MANUAL_RECONCILED,
];
