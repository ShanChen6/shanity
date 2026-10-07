import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  PaymentProviderEnum,
  PaymentStatusEnum,
  type PaymentProvider,
} from './interfaces/index.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';

const fake = (providerName: PaymentProviderEnum): PaymentProvider => ({
  providerName,
  supportedCurrencies: ['VND'],
  createPayment: () => Promise.reject(new Error('unused')),
  verifyNotification: () => Promise.reject(new Error('unused')),
  queryPayment: () =>
    Promise.resolve({
      status: PaymentStatusEnum.PENDING,
      providerTransactionId: '',
      amountPaid: 0n,
      currency: 'VND',
    }),
});

describe('PaymentProviderFactory', () => {
  it('resolves registered providers by enum and lists them', () => {
    const vietqr = fake(PaymentProviderEnum.VIETQR);
    const stripe = fake(PaymentProviderEnum.STRIPE);
    const factory = new PaymentProviderFactory([vietqr, stripe]);
    expect(factory.getProvider(PaymentProviderEnum.STRIPE)).toBe(stripe);
    expect(factory.getProvider(PaymentProviderEnum.VIETQR)).toBe(vietqr);
    expect(factory.list()).toEqual([
      PaymentProviderEnum.VIETQR,
      PaymentProviderEnum.STRIPE,
    ]);
    expect(factory.has(PaymentProviderEnum.MOMO)).toBe(false);
  });

  it('is plug and play: a third gateway needs no change to the factory', () => {
    const momo = fake(PaymentProviderEnum.MOMO);
    const factory = new PaymentProviderFactory([
      fake(PaymentProviderEnum.VIETQR),
      momo,
    ]);
    expect(factory.getProvider(PaymentProviderEnum.MOMO)).toBe(momo);
  });

  it('404s an unregistered provider and refuses duplicate registration', () => {
    const factory = new PaymentProviderFactory([]);
    expect(() => factory.getProvider(PaymentProviderEnum.VNPAY)).toThrow(
      NotFoundException,
    );
    expect(
      () =>
        new PaymentProviderFactory([
          fake(PaymentProviderEnum.VIETQR),
          fake(PaymentProviderEnum.VIETQR),
        ]),
    ).toThrow(/registered twice/);
  });
});
