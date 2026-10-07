import { describe, expect, it } from 'vitest';
import {
  OrderAuditAction,
  OrderAuditActorType,
} from '../entities/order-audit-log.entity.js';
import { OrderStatus } from '../entities/order.entity.js';
import { PaymentTransactionStatus } from '../entities/payment-transaction.entity.js';
import {
  MANUAL_RECONCILED,
  PaymentProviderEnum,
} from '../interfaces/payment-provider.enum.js';
import type { AuditLogView } from '../order-audit.service.js';
import { buildTimeline, type TimelineInput } from './admin-order-timeline.js';
import { likePattern } from './admin-order-query.service.js';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 10, minute));
const ledgerRow = (
  overrides: Partial<TimelineInput['ledger'][number]>,
): TimelineInput['ledger'][number] => ({
  id: 'row',
  provider: PaymentProviderEnum.VIETQR,
  providerTransactionId: 'FT1',
  status: PaymentTransactionStatus.SUCCESS,
  amount: 499000,
  feeAmount: 0,
  currency: 'VND' as never,
  transferContent: null,
  receivedAt: at(5),
  createdAt: at(5),
  updatedAt: at(5),
  rawPayload: {},
  ...overrides,
});
const auditRow = (overrides: Partial<AuditLogView>): AuditLogView => ({
  id: 'a',
  action: OrderAuditAction.STATUS_CHANGED,
  actorId: 'SYSTEM',
  actorType: OrderAuditActorType.SYSTEM,
  actorEmail: 'system',
  reason: 'r',
  previousState: null,
  newState: null,
  ipAddress: null,
  userAgent: null,
  createdAt: at(0),
  ...overrides,
});
const base: TimelineInput = {
  order: { status: OrderStatus.PENDING, createdAt: at(0), completedAt: null },
  ledger: [],
  auditLogs: [],
  enrollments: [],
};
const types = (input: TimelineInput) =>
  buildTimeline(input).map((event) => event.type);

describe('buildTimeline', () => {
  it('starts with the order creation', () => {
    expect(types(base)).toEqual(['ORDER_CREATED']);
  });

  it('shows initiation then the webhook for a row checkout opened and a webhook completed', () => {
    const input: TimelineInput = {
      ...base,
      order: {
        status: OrderStatus.COMPLETED,
        createdAt: at(0),
        completedAt: at(6),
      },
      // created at minute 1, completed in place at minute 5
      ledger: [ledgerRow({ createdAt: at(1), updatedAt: at(5) })],
      enrollments: [{ courseTitle: 'A', enrolledAt: at(7), revokedAt: null }],
    };
    expect(types(input)).toEqual([
      'ORDER_CREATED',
      'PAYMENT_INITIATED',
      'WEBHOOK_RECEIVED',
      'ORDER_COMPLETED',
      'ENROLLMENT_GRANTED',
    ]);
    const [, initiated, webhook] = buildTimeline(input);
    expect(initiated).toMatchObject({ provider: 'VIETQR', at: at(1) });
    expect(webhook).toMatchObject({
      providerTransactionId: 'FT1',
      amount: 499000,
      at: at(5),
    });
  });

  it('does not invent an initiation for a row recorded straight from a notification', () => {
    expect(types({ ...base, ledger: [ledgerRow({})] })).toEqual([
      'ORDER_CREATED',
      'WEBHOOK_RECEIVED',
    ]);
  });

  it('keeps INITIATED attempts and failed payments visible', () => {
    expect(
      types({
        ...base,
        ledger: [
          ledgerRow({
            status: PaymentTransactionStatus.INITIATED,
            createdAt: at(1),
            updatedAt: at(1),
          }),
          ledgerRow({
            id: 'f',
            status: PaymentTransactionStatus.FAILED,
            providerTransactionId: 'FT2',
            createdAt: at(2),
            updatedAt: at(3),
            receivedAt: at(3),
          }),
        ],
      }),
    ).toEqual([
      'ORDER_CREATED',
      'PAYMENT_INITIATED',
      'PAYMENT_INITIATED',
      'PAYMENT_FAILED',
    ]);
  });

  it('describes a manual reconciliation with who, why and the stored record', () => {
    const rawPayload = {
      reconciliation: {
        note: 'Webhook dropped',
        actor: { id: 'u1', email: 'admin@shanity.test' },
      },
    };
    const manual = buildTimeline({
      ...base,
      ledger: [ledgerRow({ provider: MANUAL_RECONCILED, rawPayload })],
    }).find((event) => event.type === 'MANUAL_RECONCILED');
    expect(manual).toMatchObject({
      provider: 'MANUAL_RECONCILED',
      actorEmail: 'admin@shanity.test',
      note: 'Webhook dropped',
      payload: rawPayload,
    });
  });

  it('adds refunds, revocations and expiry/cancellation from the audit trail', () => {
    const result = buildTimeline({
      order: {
        status: OrderStatus.REFUNDED,
        createdAt: at(0),
        completedAt: at(2),
      },
      ledger: [
        ledgerRow({ createdAt: at(1), updatedAt: at(1), receivedAt: at(1) }),
        ledgerRow({
          id: 'r',
          status: PaymentTransactionStatus.REFUNDED,
          providerTransactionId: 'RF1',
          createdAt: at(9),
          updatedAt: at(9),
          receivedAt: at(9),
        }),
      ],
      auditLogs: [
        auditRow({
          createdAt: at(0),
          newState: { status: 'EXPIRED' },
          reason: 'sweep',
        }),
        auditRow({
          id: 'b',
          createdAt: at(8),
          newState: { status: 'CANCELLED' },
        }),
        auditRow({
          id: 'c',
          action: OrderAuditAction.DETAIL_VIEWED,
          newState: { status: 'EXPIRED' },
        }),
      ],
      enrollments: [{ courseTitle: 'A', enrolledAt: at(3), revokedAt: at(10) }],
    });
    expect(result.map((event) => event.type)).toEqual([
      'ORDER_CREATED',
      'ORDER_EXPIRED', // same minute as creation: natural order kept
      'WEBHOOK_RECEIVED',
      'ORDER_COMPLETED',
      'ENROLLMENT_GRANTED',
      'ORDER_CANCELLED',
      'REFUND_ISSUED',
      'ENROLLMENT_REVOKED',
    ]);
    // a view is never a lifecycle event
    expect(
      result.filter((event) => event.type === 'ORDER_EXPIRED'),
    ).toHaveLength(1);
  });
});

describe('likePattern', () => {
  it('escapes LIKE metacharacters so search text is literal', () => {
    expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
    expect(likePattern('plain')).toBe('%plain%');
  });
});
