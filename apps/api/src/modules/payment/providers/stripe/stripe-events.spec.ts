import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PaymentStatusEnum } from '../../interfaces/index.js';
import { mapStripeEvent, readCheckoutSession } from './stripe-events.js';

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_test_1',
  object: 'checkout.session',
  client_reference_id: 'SHAN-20261007-X89K',
  amount_total: 499000,
  currency: 'vnd',
  payment_status: 'paid',
  status: 'complete',
  ...overrides,
});
const event = (type: string, object: unknown) => ({
  id: 'evt_1',
  type,
  data: { object },
});

describe('mapStripeEvent', () => {
  it('maps a paid checkout.session.completed to SUCCESS in minor units', () => {
    expect(
      mapStripeEvent(event('checkout.session.completed', session())),
    ).toEqual({
      orderCode: 'SHAN-20261007-X89K',
      providerTransactionId: 'cs_test_1',
      eventId: 'evt_1',
      amount: 499000n,
      currency: 'VND',
      status: PaymentStatusEnum.SUCCESS,
    });
  });

  it('does not settle an unpaid completed session (delayed payment method)', () => {
    const fact = mapStripeEvent(
      event(
        'checkout.session.completed',
        session({ payment_status: 'unpaid' }),
      ),
    );
    expect(fact.status).toBe(PaymentStatusEnum.PENDING);
    expect(fact.orderCode).toBe('SHAN-20261007-X89K');
  });

  it.each([
    ['checkout.session.async_payment_succeeded', PaymentStatusEnum.SUCCESS],
    ['checkout.session.async_payment_failed', PaymentStatusEnum.FAILED],
    ['checkout.session.expired', PaymentStatusEnum.EXPIRED],
  ])('maps %s to %s', (type, status) => {
    expect(
      mapStripeEvent(event(type, session({ payment_status: 'unpaid' }))).status,
    ).toBe(status);
  });

  it('acknowledges unrelated events without an order code', () => {
    const fact = mapStripeEvent(event('customer.created', { id: 'cus_1' }));
    expect(fact).toMatchObject({
      status: PaymentStatusEnum.PENDING,
      orderCode: '',
      providerTransactionId: 'evt_1',
      amount: 0n,
    });
  });

  it('rejects malformed sessions for relevant events', () => {
    for (const bad of [
      undefined,
      {},
      session({ amount_total: -1 }),
      session({ amount_total: 10.5 }),
      session({ client_reference_id: 42 }),
      session({ currency: undefined }),
    ])
      expect(() =>
        mapStripeEvent(event('checkout.session.completed', bad)),
      ).toThrow(BadRequestException);
    expect(() => mapStripeEvent('nope')).toThrow(BadRequestException);
  });
});

describe('readCheckoutSession', () => {
  it('upper-cases the currency and flags paid / expired', () => {
    expect(readCheckoutSession(session({ status: 'expired' }))).toMatchObject({
      currency: 'VND',
      paid: true,
      expired: true,
    });
  });
});
