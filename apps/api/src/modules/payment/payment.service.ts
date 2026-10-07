import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { Order } from './entities/order.entity.js';

/** Order status polling and the expiry sweep. Settlement lives elsewhere. */
@Injectable()
export class PaymentService {
  constructor(private readonly database: DatabaseService) {}

  async status(userId: string, id: string) {
    const order = await this.database.dataSource.manager
      .getRepository(Order)
      .findOneBy({ id, userId });
    if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
    return {
      orderId: order.id,
      status: order.status,
      expiresAt: order.expiresAt,
    };
  }

  /**
   * Locks the rows in id order first (CTE), then updates them: concurrent
   * sweeps and course-repricing cancellations touch overlapping orders and
   * would otherwise lock them in different orders and deadlock.
   */
  async expirePendingOrders() {
    const result: unknown = await this.database.dataSource.query(
      `WITH locked AS (
         SELECT id FROM orders
          WHERE status = 'PENDING' AND expires_at < now()
          ORDER BY id FOR UPDATE)
       UPDATE orders o SET status = 'EXPIRED', updated_at = now()
         FROM locked WHERE o.id = locked.id AND o.status = 'PENDING'
       RETURNING o.id`,
    );
    return { affected: affectedRows(result) };
  }
}

/** pg returns [rows, count] for UPDATE ... RETURNING through TypeORM. */
export function affectedRows(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') return result[1];
  return Array.isArray(result) ? result.length : 0;
}
