import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CourseCurrency } from '../../../courses/course-currency.js';
import { DatabaseService } from '../../../database/database.module.js';
import { OrderAuditAction } from '../entities/order-audit-log.entity.js';
import { OrderStatus } from '../entities/order.entity.js';
import { PaymentTransactionStatus } from '../entities/payment-transaction.entity.js';
import type { LedgerProvider } from '../interfaces/payment-provider.enum.js';
import { orderLookup } from '../order-ref.js';
import {
  isBackOffice,
  OrderAuditService,
  type AdminRequestContext,
} from '../order-audit.service.js';
import { buildTimeline } from './admin-order-timeline.js';
import type {
  AdminLedgerEntry,
  AdminOrderDetail,
  AdminOrderList,
  AdminOrderListItem,
} from './admin-order.view.js';
import type {
  AdminOrderSortField,
  AdminOrdersQueryDto,
} from './admin-orders.dto.js';

const DEFAULT_LIMIT = 20;

// Whitelisted ORDER BY expressions; user input only ever picks a key.
const SORT_SQL: Record<AdminOrderSortField, string> = {
  createdAt: 'o.created_at',
  completedAt: 'o.completed_at',
  finalTotal: 'o.final_total',
  code: 'o.code',
  status: 'o.status::text',
  studentName: 'lower(u.display_name)',
};

/** `%`, `_` and `\` are LIKE metacharacters; a search term is plain text. */
export const likePattern = (term: string) =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const VIEW_REASON = 'Admin opened the order detail';

interface ListRow {
  id: string;
  code: string;
  status: OrderStatus;
  currency: CourseCurrency;
  subtotal: string;
  discount_total: string;
  final_total: string;
  payment_provider: LedgerProvider | null;
  paid_provider: LedgerProvider | null;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date;
  student_id: string;
  student_name: string;
  student_email: string;
  paid_amount: string;
  refunded_amount: string;
  courses: Array<{ title: string; finalPrice: string }>;
}

/**
 * Read side of the admin order console. Reads `orders`, `order_items`
 * (frozen snapshots), `payment_transactions`, `users` and the audit trail;
 * it never joins `courses`, so a later price or title change cannot rewrite
 * what an old order shows.
 */
@Injectable()
export class AdminOrderQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: OrderAuditService,
  ) {}

  async list(query: AdminOrdersQueryDto): Promise<AdminOrderList> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    if (
      query.dateFrom &&
      query.dateTo &&
      new Date(query.dateFrom) > new Date(query.dateTo)
    )
      throw new BadRequestException('DATE_RANGE_INVALID');
    if (
      query.amountMin !== undefined &&
      query.amountMax !== undefined &&
      query.amountMin > query.amountMax
    )
      throw new BadRequestException('AMOUNT_RANGE_INVALID');

    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where: string[] = [];

    if (query.q) {
      const like = bind(likePattern(query.q));
      where.push(`(
        o.code ILIKE ${like} ESCAPE '\\'
        OR u.email ILIKE ${like} ESCAPE '\\'
        OR u.display_name ILIKE ${like} ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM order_items i
                    WHERE i.order_id = o.id AND i.course_title_snapshot ILIKE ${like} ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM payment_transactions t
                    WHERE t.order_id = o.id AND t.provider_transaction_id ILIKE ${like} ESCAPE '\\'))`);
    }
    if (query.status) where.push(`o.status = ${bind(query.status)}`);
    if (query.provider) {
      const provider = bind(query.provider);
      where.push(`(o.payment_provider = ${provider}
        OR EXISTS (SELECT 1 FROM payment_transactions t
                    WHERE t.order_id = o.id AND t.provider = ${provider}))`);
    }
    const dateColumn =
      query.dateField === 'completedAt' ? 'o.completed_at' : 'o.created_at';
    if (query.dateFrom)
      where.push(`${dateColumn} >= ${bind(new Date(query.dateFrom))}`);
    if (query.dateTo)
      where.push(`${dateColumn} <= ${bind(new Date(query.dateTo))}`);
    if (query.amountMin !== undefined)
      where.push(`o.final_total >= ${bind(query.amountMin)}`);
    if (query.amountMax !== undefined)
      where.push(`o.final_total <= ${bind(query.amountMax)}`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderSql = `${SORT_SQL[query.sortBy ?? 'createdAt']} ${direction} NULLS LAST, o.id ${direction}`;

    const manager = this.database.dataSource.manager;
    const [{ total }] = await manager.query<Array<{ total: string }>>(
      `SELECT count(*)::text AS total
         FROM orders o JOIN users u ON u.id = o.user_id ${whereSql}`,
      params,
    );
    const rows = await manager.query<ListRow[]>(
      `SELECT o.id, o.code, o.status, o.currency, o.subtotal, o.discount_total,
              o.final_total, o.payment_provider, o.created_at, o.completed_at,
              o.expires_at,
              u.id AS student_id, u.display_name AS student_name, u.email AS student_email,
              COALESCE(p.paid, 0)::text AS paid_amount,
              COALESCE(p.refunded, 0)::text AS refunded_amount,
              p.paid_provider,
              (SELECT COALESCE(json_agg(json_build_object(
                        'title', i.course_title_snapshot,
                        'finalPrice', i.final_price_snapshot::text)
                      ORDER BY i.position, i.id), '[]'::json)
                 FROM order_items i WHERE i.order_id = o.id) AS courses
         FROM orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN LATERAL (
           SELECT sum(t.amount) FILTER (WHERE t.status = 'SUCCESS') AS paid,
                  sum(t.amount) FILTER (WHERE t.status IN ('REFUNDED','PARTIALLY_REFUNDED')) AS refunded,
                  (array_agg(t.provider ORDER BY t.received_at DESC)
                     FILTER (WHERE t.status = 'SUCCESS'))[1] AS paid_provider
             FROM payment_transactions t WHERE t.order_id = o.id) p ON true
         ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`,
      params,
    );

    const count = Number(total);
    return {
      items: rows.map(toListItem),
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    };
  }

  /**
   * Full detail. Opening it is itself recorded (`DETAIL_VIEWED`) in the same
   * transaction that reads it, so the viewer is on the trail they see.
   */
  async detail(
    ref: string,
    context: AdminRequestContext,
  ): Promise<AdminOrderDetail> {
    if (!isBackOffice(context.principal)) throw new ForbiddenException();
    const lookup = orderLookup(ref);
    if (!lookup) throw new NotFoundException('ORDER_NOT_FOUND');
    return this.database.dataSource.transaction(async (manager) => {
      const [found] = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM orders WHERE ${'id' in lookup ? 'id' : 'code'} = $1`,
        ['id' in lookup ? lookup.id : lookup.code],
      );
      if (!found) throw new NotFoundException('ORDER_NOT_FOUND');
      const actor = await this.audit.adminActor(manager, context);
      await this.audit.append(manager, {
        orderId: found.id,
        actor,
        action: OrderAuditAction.DETAIL_VIEWED,
        reason: VIEW_REASON,
        newState: { target: 'order' },
      });
      return this.load(manager, found.id);
    });
  }

  /** The detail as it is now, without recording a view (used after writes). */
  async load(
    manager: EntityManager,
    orderId: string,
  ): Promise<AdminOrderDetail> {
    const [order] = await manager.query<
      Array<{
        id: string;
        code: string;
        user_id: string;
        status: OrderStatus;
        currency: CourseCurrency;
        subtotal: string;
        discount_total: string;
        final_total: string;
        payment_provider: LedgerProvider | null;
        created_at: Date;
        completed_at: Date | null;
        expires_at: Date;
        student_name: string;
        student_email: string;
      }>
    >(
      `SELECT o.id, o.code, o.user_id, o.status, o.currency, o.subtotal,
              o.discount_total, o.final_total, o.payment_provider, o.created_at,
              o.completed_at, o.expires_at,
              u.display_name AS student_name, u.email AS student_email
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
      [orderId],
    );
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

    const items = await manager.query<
      Array<{
        id: string;
        course_id: string;
        course_title_snapshot: string;
        unit_price_snapshot: string;
        discount_snapshot: string;
        final_price_snapshot: string;
        currency: CourseCurrency;
      }>
    >(
      `SELECT id, course_id, course_title_snapshot, unit_price_snapshot,
              discount_snapshot, final_price_snapshot, currency
         FROM order_items WHERE order_id = $1 ORDER BY position, id`,
      [orderId],
    );
    const ledger = await manager.query<
      Array<{
        id: string;
        provider: LedgerProvider;
        provider_transaction_id: string | null;
        status: PaymentTransactionStatus;
        amount: string;
        fee_amount: string;
        currency: CourseCurrency;
        transfer_content: string | null;
        received_at: Date;
        created_at: Date;
        updated_at: Date;
        raw_payload: Record<string, unknown>;
      }>
    >(
      `SELECT id, provider, provider_transaction_id, status, amount, fee_amount,
              currency, transfer_content, received_at, created_at, updated_at,
              raw_payload
         FROM payment_transactions WHERE order_id = $1
        ORDER BY created_at, id`,
      [orderId],
    );
    const enrollments = await manager.query<
      Array<{ course_id: string; enrolled_at: Date; revoked_at: Date | null }>
    >(
      `SELECT course_id, enrolled_at, revoked_at FROM enrollments
        WHERE user_id = $1 AND course_id = ANY($2::uuid[])`,
      [order.user_id, items.map((item) => item.course_id)],
    );
    const auditLogs = await this.audit.listForOrder(manager, orderId);

    const byCourse = new Map(enrollments.map((row) => [row.course_id, row]));
    const titles = new Map(
      items.map((item) => [item.course_id, item.course_title_snapshot]),
    );

    const ledgerEntries = ledger.map((row) => ({
      id: row.id,
      provider: row.provider,
      providerTransactionId: row.provider_transaction_id,
      status: row.status,
      amount: Number(row.amount),
      feeAmount: Number(row.fee_amount),
      currency: row.currency,
      transferContent: row.transfer_content,
      receivedAt: row.received_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rawPayload: row.raw_payload,
    }));
    const paid = sum(ledgerEntries, [PaymentTransactionStatus.SUCCESS]);
    const refunded = sum(ledgerEntries, [
      PaymentTransactionStatus.REFUNDED,
      PaymentTransactionStatus.PARTIALLY_REFUNDED,
    ]);
    const refundable = Math.max(0, paid - refunded);
    const paidProvider =
      [...ledgerEntries]
        .reverse()
        .find((entry) => entry.status === PaymentTransactionStatus.SUCCESS)
        ?.provider ?? null;

    return {
      id: order.id,
      code: order.code,
      status: order.status,
      student: {
        id: order.user_id,
        displayName: order.student_name,
        email: order.student_email,
      },
      items: items.map((item) => {
        const enrollment = byCourse.get(item.course_id);
        return {
          id: item.id,
          courseId: item.course_id,
          title: item.course_title_snapshot,
          unitPrice: Number(item.unit_price_snapshot),
          discount: Number(item.discount_snapshot),
          finalPrice: Number(item.final_price_snapshot),
          currency: item.currency,
          enrollment: !enrollment
            ? 'NONE'
            : enrollment.revoked_at
              ? 'REVOKED'
              : 'ACTIVE',
        };
      }),
      summary: {
        currency: order.currency,
        subtotal: Number(order.subtotal),
        discountTotal: Number(order.discount_total),
        finalTotal: Number(order.final_total),
        paidAmount: paid,
        refundedAmount: refunded,
        refundableAmount: refundable,
        refundStatus:
          refunded === 0
            ? 'NONE'
            : refundable === 0
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED',
      },
      provider: paidProvider ?? order.payment_provider,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      expiresAt: order.expires_at,
      transactions: ledgerEntries.map(
        ({ updatedAt: _updatedAt, ...entry }): AdminLedgerEntry => entry,
      ),
      timeline: buildTimeline({
        order: {
          status: order.status,
          createdAt: order.created_at,
          completedAt: order.completed_at,
        },
        ledger: ledgerEntries,
        auditLogs,
        enrollments: enrollments.map((row) => ({
          courseTitle: titles.get(row.course_id) ?? '',
          enrolledAt: row.enrolled_at,
          revokedAt: row.revoked_at,
        })),
      }),
      auditLogs,
      actions: {
        canReconcile:
          order.status === OrderStatus.PENDING ||
          order.status === OrderStatus.EXPIRED,
        canRefund: order.status === OrderStatus.COMPLETED && refundable > 0,
      },
    };
  }
}

const sum = (
  entries: Array<{ status: PaymentTransactionStatus; amount: number }>,
  statuses: PaymentTransactionStatus[],
) =>
  entries
    .filter((entry) => statuses.includes(entry.status))
    .reduce((total, entry) => total + entry.amount, 0);

function toListItem(row: ListRow): AdminOrderListItem {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    student: {
      id: row.student_id,
      displayName: row.student_name,
      email: row.student_email,
    },
    courses: row.courses.map((course) => ({
      title: course.title,
      finalPrice: Number(course.finalPrice),
    })),
    currency: row.currency,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discount_total),
    finalTotal: Number(row.final_total),
    paidAmount: Number(row.paid_amount),
    refundedAmount: Number(row.refunded_amount),
    provider: row.paid_provider ?? row.payment_provider,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
  };
}
