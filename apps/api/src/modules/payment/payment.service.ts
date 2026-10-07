import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { Order, OrderStatus } from './entities/order.entity.js';

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

  async expirePendingOrders() {
    return this.database.dataSource.manager
      .getRepository(Order)
      .createQueryBuilder()
      .update()
      .set({ status: OrderStatus.EXPIRED })
      .where('status = :status', { status: OrderStatus.PENDING })
      .andWhere('expires_at < now()')
      .execute();
  }
}
