import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DatabaseService } from '../../database/database.module.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import { OrderQueryService } from './order-query.service.js';
import type { OrderItemView, OrderView } from './order-view.js';

export type OrderListFilter = 'all' | 'pending' | 'completed' | 'cancelled';

const FILTER_STATUSES: Record<OrderListFilter, OrderStatus[] | null> = {
  all: null,
  pending: [OrderStatus.PENDING, OrderStatus.PROCESSING],
  completed: [OrderStatus.COMPLETED, OrderStatus.REFUNDED],
  cancelled: [OrderStatus.CANCELLED, OrderStatus.EXPIRED],
};

export interface StudentOrderItem extends OrderItemView {
  /** Navigation only (link to the learning room); never used for money. */
  courseSlug: string | null;
}

export interface StudentOrder extends Omit<OrderView, 'items'> {
  items: StudentOrderItem[];
  /** Latest bank/gateway transaction code, if any money event exists. */
  providerTransactionId: string | null;
  /** PENDING and not yet expired: the buyer can reopen checkout. */
  canResume: boolean;
}

export interface StudentOrderPage {
  data: StudentOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Student-facing order reads. Amounts, titles and order state come from the
 * frozen order rows only. The single read of `courses` is the slug, which is
 * a navigation hint for "go to the course" links and carries no money.
 */
@Injectable()
export class StudentOrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queries: OrderQueryService,
  ) {}

  async list(
    userId: string,
    options: { status?: OrderListFilter; page?: number; limit?: number },
  ): Promise<StudentOrderPage> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
    const page = Math.max(options.page ?? 1, 1);
    const statuses = FILTER_STATUSES[options.status ?? 'all'];

    return this.database.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const [orders, total] = await manager
          .getRepository(Order)
          .findAndCount({
            where: { userId, ...(statuses && { status: In(statuses) }) },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: limit,
            skip: (page - 1) * limit,
          });
        const items = orders.length
          ? await manager.getRepository(OrderItem).find({
              where: { orderId: In(orders.map((order) => order.id)) },
              order: { position: 'ASC', id: 'ASC' },
            })
          : [];
        const transactions = orders.length
          ? await manager.query<
              Array<{
                order_id: string;
                provider_transaction_id: string | null;
              }>
            >(
              // A confirmed payment wins over later failed attempts.
              `SELECT DISTINCT ON (order_id) order_id, provider_transaction_id
                 FROM payment_transactions
                WHERE order_id = ANY($1) AND provider_transaction_id IS NOT NULL
                ORDER BY order_id, (status = 'SUCCESS') DESC, received_at DESC, id DESC`,
              [orders.map((order) => order.id)],
            )
          : [];
        const slugs = await this.slugs(
          manager,
          items.map((item) => item.courseId),
        );
        const transactionByOrder = new Map(
          transactions.map((row) => [
            row.order_id,
            row.provider_transaction_id,
          ]),
        );
        const now = new Date();
        return {
          data: orders.map((order) =>
            this.present(
              order,
              items.filter((item) => item.orderId === order.id),
              slugs,
              transactionByOrder.get(order.id) ?? null,
              now,
            ),
          ),
          total,
          page,
          limit,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        };
      },
    );
  }

  /** One of the caller's own orders, by code or id (checkout / result page). */
  async get(userId: string, orderRef: string): Promise<StudentOrder> {
    const view = await this.queries.getOrderDetails(orderRef, { userId });
    const slugs = await this.slugs(
      this.database.dataSource.manager,
      view.items.map((item) => item.courseId),
    );
    const settled = view.payments
      ?.filter((payment) => payment.providerTransactionId)
      .sort(
        (a, b) =>
          Number(b.status === 'SUCCESS') - Number(a.status === 'SUCCESS') ||
          b.receivedAt.getTime() - a.receivedAt.getTime(),
      )[0];
    return {
      ...view,
      items: view.items.map((item) => ({
        ...item,
        courseSlug: slugs.get(item.courseId) ?? null,
      })),
      providerTransactionId: settled?.providerTransactionId ?? null,
      canResume: this.canResume(view.status, view.expiresAt, new Date()),
    };
  }

  private present(
    order: Order,
    items: OrderItem[],
    slugs: Map<string, string>,
    providerTransactionId: string | null,
    now: Date,
  ): StudentOrder {
    return {
      orderId: order.id,
      code: order.code,
      status: order.status,
      currency: order.currency,
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      finalTotal: order.finalTotal,
      paymentProvider: order.paymentProvider,
      expiresAt: order.expiresAt,
      createdAt: order.createdAt,
      items: items.map((item) => ({
        id: item.id,
        courseId: item.courseId,
        courseTitleSnapshot: item.courseTitleSnapshot,
        unitPriceSnapshot: item.unitPriceSnapshot,
        discountSnapshot: item.discountSnapshot,
        finalPriceSnapshot: item.finalPriceSnapshot,
        currency: item.currency,
        courseSlug: slugs.get(item.courseId) ?? null,
      })),
      providerTransactionId,
      canResume: this.canResume(order.status, order.expiresAt, now),
    };
  }

  private canResume(status: OrderStatus, expiresAt: Date, now: Date) {
    return status === OrderStatus.PENDING && expiresAt > now;
  }

  private async slugs(
    manager: { query: <T>(sql: string, params: unknown[]) => Promise<T> },
    courseIds: string[],
  ) {
    if (courseIds.length === 0) return new Map<string, string>();
    const rows = await manager.query<Array<{ id: string; slug: string }>>(
      'SELECT id, slug FROM courses WHERE id = ANY($1)',
      [courseIds],
    );
    return new Map(rows.map((row) => [row.id, row.slug]));
  }
}
