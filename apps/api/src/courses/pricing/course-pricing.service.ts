import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseService } from '../../database/database.module.js';
import { affectedRows } from '../../modules/payment/payment.service.js';
import { CourseAccessType } from '../course-access-type.js';
import { CourseCurrency } from '../course-currency.js';
import { CoursePriceLog } from '../course-price-log.entity.js';
import { Course } from '../course.entity.js';
import type { UpdateCoursePricingDto } from './course-pricing.dto.js';
import {
  classifyTransition,
  PricingTransition,
  resolveNextPricing,
} from './course-pricing.rules.js';

export interface CoursePricingResult {
  courseId: string;
  accessType: CourseAccessType;
  price: number;
  currency: CourseCurrency;
  transition: PricingTransition;
  cancelledPendingOrders: number;
}

const HISTORY_LIMIT = 100;

@Injectable()
export class CoursePricingService {
  constructor(private readonly database: DatabaseService) {}

  updateCoursePricing(
    courseId: string,
    updateDto: UpdateCoursePricingDto,
    updatedBy: string,
  ): Promise<CoursePricingResult> {
    return this.database.dataSource.transaction((manager) =>
      this.applyPricing(manager, courseId, updateDto, updatedBy),
    );
  }

  /**
   * Runs inside the caller's transaction so a pricing change can be combined
   * with other course edits atomically. The course row is locked FOR NO KEY
   * UPDATE: it excludes order creation's FOR SHARE read (so an order snapshots
   * the price either before or after this change, never a mix) but, unlike
   * FOR UPDATE, not the FOR KEY SHARE that enrollment/order-item foreign keys
   * take, which would otherwise deadlock against a webhook holding an order.
   */
  async applyPricing(
    manager: EntityManager,
    courseId: string,
    updateDto: UpdateCoursePricingDto,
    updatedBy: string,
  ): Promise<CoursePricingResult> {
    const course = await manager.getRepository(Course).findOne({
      where: { id: courseId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!course) throw new NotFoundException('Course not found');

    const next = resolveNextPricing(course, updateDto);
    const transition = classifyTransition(course, next);
    if (transition === PricingTransition.UNCHANGED)
      return { courseId, ...next, transition, cancelledPendingOrders: 0 };

    // PAID -> FREE: nothing left to pay for. Any PENDING order containing the
    // course is cancelled whole (the buyer re-orders the rest). COMPLETED
    // orders and existing enrollments are untouched; otherwise PENDING orders
    // keep their snapshot.
    let cancelledPendingOrders = 0;
    if (transition === PricingTransition.PAID_TO_FREE) {
      // Rows are locked in id order before updating (see PaymentService.
      // expirePendingOrders) so concurrent cancellations cannot deadlock.
      const cancelled: unknown = await manager.query(
        `WITH locked AS (
           SELECT id FROM orders
            WHERE status = 'PENDING'
              AND id IN (SELECT order_id FROM order_items WHERE course_id = $1)
            ORDER BY id FOR UPDATE)
         UPDATE orders o SET status = 'CANCELLED', updated_at = now()
           FROM locked WHERE o.id = locked.id AND o.status = 'PENDING'
         RETURNING o.id`,
        [courseId],
      );
      cancelledPendingOrders = affectedRows(cancelled);
    }

    await manager.getRepository(Course).update({ id: courseId }, next);
    await manager.getRepository(CoursePriceLog).insert({
      courseId,
      oldPrice: course.price,
      newPrice: next.price,
      oldCurrency: course.currency,
      newCurrency: next.currency,
      oldAccessType: course.accessType,
      newAccessType: next.accessType,
      cancelledPendingOrders,
      changedByUserId: updatedBy,
    });

    return { courseId, ...next, transition, cancelledPendingOrders };
  }

  async listPriceHistory(courseId: string) {
    const manager = this.database.dataSource.manager;
    if (!(await manager.getRepository(Course).existsBy({ id: courseId })))
      throw new NotFoundException('Course not found');
    return manager.getRepository(CoursePriceLog).find({
      where: { courseId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: HISTORY_LIMIT,
    });
  }
}
