import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../database/database.module.js';
import type { PaymentEventBus } from './events/payment-event-bus.js';
import { PaymentStatusEnum } from './interfaces/index.js';
import type { PaymentProviderFactory } from './payment-provider.factory.js';
import {
  CHECKOUT_MAX_PER_RUN,
  PaymentReconciliationService,
} from './payment-reconciliation.service.js';
import type { PaymentSettlementService } from './payment-settlement.service.js';

type Row = {
  id: string;
  created_at: string;
  code: string;
  provider: string;
  provider_transaction_id: string;
};

const row = (n: number): Row => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  created_at: `2026-10-10 08:00:${String(n % 60).padStart(2, '0')}+00`,
  code: `SHAN-${n}`,
  provider: 'STRIPE',
  provider_transaction_id: `cs_${n}`,
});

/** Serves the stale-checkout query by keyset over `rows` (already ordered). */
function setup(rows: Row[], paid: Set<string>) {
  const query = vi.fn(async (_sql: string, params: unknown[]) => {
    const [limit, , , afterId] = params as [number, number, string, string];
    const start = afterId ? rows.findIndex((r) => r.id === afterId) + 1 : 0;
    return rows.slice(start, start + limit);
  });
  const queryPayment = vi.fn(async (code: string) => ({
    status: paid.has(code)
      ? PaymentStatusEnum.SUCCESS
      : PaymentStatusEnum.PENDING,
    providerTransactionId: `cs_${code}`,
    amountPaid: 100000n,
    currency: 'VND',
  }));
  const settle = vi.fn(async () => undefined);
  const service = new PaymentReconciliationService(
    { dataSource: { query } } as unknown as DatabaseService,
    {
      has: () => true,
      getProvider: () => ({ providerName: 'STRIPE', queryPayment }),
    } as unknown as PaymentProviderFactory,
    { settle } as unknown as PaymentSettlementService,
    {} as PaymentEventBus,
  );
  return { service, query, queryPayment, settle };
}

describe('PaymentReconciliationService.reconcilePendingCheckouts', () => {
  it('reaches a paid session behind more open ones than fit in a page', async () => {
    // 120 sessions that are merely still open, then the one that was paid
    // and lost its webhook. Only looking at the oldest page starved it.
    const rows = Array.from({ length: 121 }, (_, i) => row(i + 1));
    const { service, query, settle } = setup(rows, new Set(['SHAN-121']));

    expect(await service.reconcilePendingCheckouts(0)).toBe(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle.mock.calls[0]).toEqual([
      'STRIPE',
      expect.objectContaining({ orderCode: 'SHAN-121' }),
    ]);
    // Pages of 50, 50, 21; each continues after the last row it saw.
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][1].slice(2)).toEqual([
      rows[49].created_at,
      rows[49].id,
    ]);
  });

  it('looks at no more than CHECKOUT_MAX_PER_RUN checkouts in one run', async () => {
    const rows = Array.from({ length: CHECKOUT_MAX_PER_RUN + 70 }, (_, i) =>
      row(i + 1),
    );
    const { service, queryPayment } = setup(rows, new Set());
    await service.reconcilePendingCheckouts(0);
    expect(queryPayment).toHaveBeenCalledTimes(CHECKOUT_MAX_PER_RUN);
  });

  it('stops after a short page without asking again', async () => {
    const { service, query } = setup([row(1), row(2)], new Set());
    expect(await service.reconcilePendingCheckouts(0)).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([50, 0, null, null]);
  });
});
