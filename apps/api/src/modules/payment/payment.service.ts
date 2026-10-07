import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import {
  PaymentProvider,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity.js';
import { extractOrderCode } from './order-snapshot.js';
import { PaymentTransactionService } from './payment-transaction.service.js';
import type { VietQrWebhookDto } from './payment.dto.js';

@Injectable()
export class PaymentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly transactions: PaymentTransactionService,
  ) {}

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

  async processWebhook(
    dto: VietQrWebhookDto,
    rawPayload: Record<string, unknown>,
  ) {
    return this.database.dataSource.transaction(async (manager) => {
      const markProcessed = () =>
        manager.query(
          'UPDATE bank_webhook_logs SET processed = true WHERE reference_code = $1',
          [dto.transactionId],
        );
      const claimed: unknown[] = await manager.query(
        `INSERT INTO bank_webhook_logs(reference_code, processed) VALUES ($1, false)
         ON CONFLICT(reference_code) DO NOTHING RETURNING id`,
        [dto.transactionId],
      );
      if (claimed.length === 0) return { status: 'ALREADY_PROCESSED' };

      const code = extractOrderCode(dto.transferContent);
      if (!code) {
        await markProcessed();
        return { status: 'IGNORED' };
      }
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('orders')
        .setLock('pessimistic_write')
        .where('orders.code = :code', { code })
        .getOne();
      if (!order) {
        await markProcessed();
        return { status: 'IGNORED' };
      }

      const record = (status: PaymentTransactionStatus) =>
        this.transactions.record(manager, {
          orderId: order.id,
          provider: PaymentProvider.VIETQR,
          providerTransactionId: dto.transactionId,
          amount: dto.amount,
          currency: order.currency,
          status,
          transferContent: dto.transferContent,
          rawPayload,
        });

      if (
        order.status === OrderStatus.PENDING &&
        order.expiresAt <= new Date()
      ) {
        order.status = OrderStatus.EXPIRED;
        await manager.save(order);
      }
      if (order.status !== OrderStatus.PENDING) {
        // Money arrived for an order that can no longer be fulfilled
        // (expired, cancelled, already paid, refunded). Keep the evidence so
        // finance can reconcile or refund; grant nothing.
        await record(PaymentTransactionStatus.FAILED);
        await markProcessed();
        return { status: 'IGNORED' };
      }

      if (dto.amount < order.finalTotal) {
        await record(PaymentTransactionStatus.FAILED);
        order.status = OrderStatus.PROCESSING;
        await manager.save(order);
        await markProcessed();
        return { status: 'PARTIAL_AMOUNT' };
      }

      await record(PaymentTransactionStatus.SUCCESS);
      order.status = OrderStatus.COMPLETED;
      await manager.save(order);
      // Access comes from the items frozen at checkout, never from `courses`.
      await manager.query(
        `INSERT INTO enrollments(user_id, course_id)
         SELECT $1, course_id FROM order_items WHERE order_id = $2
         ON CONFLICT DO NOTHING`,
        [order.userId, order.id],
      );
      await markProcessed();
      return { status: 'COMPLETED' };
    });
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
