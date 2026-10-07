import { Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { DatabaseService } from '../../database/database.module.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order } from './entities/order.entity.js';
import { PaymentTransaction } from './entities/payment-transaction.entity.js';
import { toOrderView, type OrderView } from './order-view.js';

/** Who is asking. There is deliberately no default: callers must say. */
export type OrderAccess = { userId: string } | { staff: true };

const MAX_PAGE = 100;
const MAX_OFFSET = 1_000_000;

/**
 * Read side of the order domain. PERSISTENCE INVARIANT: this service reads
 * only `orders`, `order_items` and `payment_transactions`. It must never
 * import or query `Course`, because a course's current price and title say
 * nothing about what was agreed at checkout (guarded by order-snapshot.spec).
 */
@Injectable()
export class OrderQueryService {
  constructor(private readonly database: DatabaseService) {}

  async getOrderDetails(
    orderId: string,
    access: OrderAccess,
  ): Promise<OrderView> {
    // REPEATABLE READ gives header, items and payments one consistent view.
    return this.database.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const order = await manager.getRepository(Order).findOneBy({
          id: orderId,
          ...('userId' in access && { userId: access.userId }),
        });
        if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
        const [items, payments] = await Promise.all([
          manager.getRepository(OrderItem).find({
            where: { orderId },
            order: { position: 'ASC', id: 'ASC' },
          }),
          manager.getRepository(PaymentTransaction).find({
            where: { orderId },
            order: { receivedAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
          }),
        ]);
        return toOrderView(order, items, payments);
      },
    );
  }

  async listUserOrders(
    userId: string,
    page: { limit?: number; offset?: number } = {},
  ): Promise<OrderView[]> {
    const take = Math.min(Math.max(page.limit ?? 20, 1), MAX_PAGE);
    const skip = Math.min(Math.max(page.offset ?? 0, 0), MAX_OFFSET);
    return this.database.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const orders = await manager.getRepository(Order).find({
          where: { userId },
          order: { createdAt: 'DESC', id: 'DESC' },
          take,
          skip,
        });
        if (orders.length === 0) return [];
        const items = await manager.getRepository(OrderItem).find({
          where: { orderId: In(orders.map((order) => order.id)) },
          order: { position: 'ASC', id: 'ASC' },
        });
        return orders.map((order) =>
          toOrderView(
            order,
            items.filter((item) => item.orderId === order.id),
          ),
        );
      },
    );
  }
}
