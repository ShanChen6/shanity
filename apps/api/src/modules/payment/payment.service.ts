import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { OrderStatus } from './entities/order.entity.js';
import { orderLookup } from './order-ref.js';

export interface OrderStatusView {
  status: OrderStatus;
  /** Money received and the order fulfilled. */
  isPaid: boolean;
  expiresAt: Date;
  serverTime: Date;
}

/** Order status polling and the expiry sweep. Settlement lives elsewhere. */
@Injectable()
export class PaymentService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Polling endpoint: a single indexed lookup, no entity hydration, no joins.
   * `serverTime` lets the client keep its countdown honest despite clock skew.
   */
  async status(userId: string, orderRef: string): Promise<OrderStatusView> {
    const lookup = orderLookup(orderRef);
    if (!lookup) throw new NotFoundException('ORDER_NOT_FOUND');
    const [row] = await this.database.dataSource.query<
      Array<{ status: OrderStatus; expires_at: Date; now: Date }>
    >(
      `SELECT status, expires_at, now() AS now FROM orders
        WHERE user_id = $1 AND ${'id' in lookup ? 'id' : 'code'} = $2`,
      [userId, 'id' in lookup ? lookup.id : lookup.code],
    );
    if (!row) throw new NotFoundException('ORDER_NOT_FOUND');
    return {
      status: row.status,
      isPaid: row.status === OrderStatus.COMPLETED,
      expiresAt: row.expires_at,
      serverTime: row.now,
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
