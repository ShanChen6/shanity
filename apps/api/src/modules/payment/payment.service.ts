import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DatabaseService } from '../../database/database.module.js';
import { Course } from '../../courses/course.entity.js';
import { CourseStatus } from '../../courses/course-status.js';
import { Enrollment } from '../../courses/enrollment.entity.js';
import { Order, OrderStatus, PaymentMethod } from './entities/order.entity.js';
import {
  PaymentTransaction,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity.js';
import type { VietQrWebhookDto } from './payment.dto.js';

const ORDER_CODE = /SHAN[A-Z0-9]+/i;

@Injectable()
export class PaymentService {
  constructor(private readonly database: DatabaseService) {}

  async createOrder(userId: string, courseId: string) {
    const manager = this.database.dataSource.manager;
    const course = await manager
      .getRepository(Course)
      .findOneBy({ id: courseId });
    if (!course || course.status !== CourseStatus.PUBLISHED)
      throw new NotFoundException('COURSE_NOT_FOUND');
    if (await manager.getRepository(Enrollment).existsBy({ userId, courseId }))
      throw new BadRequestException('ALREADY_ENROLLED');

    const order = manager.getRepository(Order).create({
      code: await this.uniqueCode(),
      userId,
      courseId,
      amount: course.price,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.VIETQR,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    await manager.save(order);
    return {
      orderId: order.id,
      code: order.code,
      amount: order.amount,
      expiresAt: order.expiresAt,
      qrCodeUrl: this.qrUrl(order),
    };
  }

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
      const claimed: unknown[] = await manager.query(
        `INSERT INTO bank_webhook_logs(reference_code, processed) VALUES ($1, false)
         ON CONFLICT(reference_code) DO NOTHING RETURNING id`,
        [dto.transactionId],
      );
      if (claimed.length === 0) return { status: 'ALREADY_PROCESSED' };

      const code = dto.transferContent.match(ORDER_CODE)?.[0]?.toUpperCase();
      if (!code) {
        await manager.query(
          'UPDATE bank_webhook_logs SET processed = true WHERE reference_code = $1',
          [dto.transactionId],
        );
        return { status: 'IGNORED' };
      }
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('orders')
        .setLock('pessimistic_write')
        .where('orders.code = :code', { code })
        .getOne();
      if (
        !order ||
        order.status !== OrderStatus.PENDING ||
        order.expiresAt <= new Date()
      ) {
        if (
          order?.status === OrderStatus.PENDING &&
          order.expiresAt <= new Date()
        ) {
          order.status = OrderStatus.EXPIRED;
          await manager.save(order);
        }
        await manager.query(
          'UPDATE bank_webhook_logs SET processed = true WHERE reference_code = $1',
          [dto.transactionId],
        );
        return { status: 'IGNORED' };
      }

      const transaction = manager.getRepository(PaymentTransaction).create({
        orderId: order.id,
        providerTransactionId: dto.transactionId,
        amount: dto.amount,
        transferContent: dto.transferContent,
        rawPayload,
        status:
          dto.amount < order.amount
            ? PaymentTransactionStatus.FAILED
            : PaymentTransactionStatus.SUCCESS,
      });
      await manager.save(transaction);
      if (dto.amount < order.amount) {
        order.status = OrderStatus.PROCESSING;
        await manager.save(order);
        await manager.query(
          'UPDATE bank_webhook_logs SET processed = true WHERE reference_code = $1',
          [dto.transactionId],
        );
        return { status: 'PARTIAL_AMOUNT' };
      }

      order.status = OrderStatus.COMPLETED;
      await manager.save(order);
      await manager
        .getRepository(Enrollment)
        .createQueryBuilder()
        .insert()
        .values({ userId: order.userId, courseId: order.courseId })
        .orIgnore()
        .execute();
      await manager.query(
        'UPDATE bank_webhook_logs SET processed = true WHERE reference_code = $1',
        [dto.transactionId],
      );
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

  private async uniqueCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let suffix = '';
      for (let index = 0; index < 6; index++)
        suffix += alphabet[randomInt(alphabet.length)];
      const code = `SHAN${suffix}`;
      if (
        !(await this.database.dataSource.manager
          .getRepository(Order)
          .existsBy({ code }))
      )
        return code;
    }
    throw new ConflictException('ORDER_CODE_GENERATION_FAILED');
  }

  private qrUrl(order: Order) {
    const bank = process.env.VIETQR_BANK_ID ?? 'MB';
    const account = process.env.VIETQR_ACCOUNT_NO ?? '';
    const name = process.env.VIETQR_ACCOUNT_NAME ?? '';
    const query = new URLSearchParams({
      amount: String(order.amount),
      addInfo: order.code,
      accountName: name,
    });
    return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(account)}-compact2.png?${query}`;
  }
}
