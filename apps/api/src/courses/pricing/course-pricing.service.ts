import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseService } from '../../database/database.module.js';
import { Order, OrderStatus } from '../../modules/payment/entities/order.entity.js';
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
   * with other course edits atomically. The course row is locked FOR UPDATE;
   * order creation takes FOR SHARE on the same row, so an order always
   * snapshots either the price before or after this change, never a mix.
   */
  async applyPricing(
    manager: EntityManager,
    courseId: string,
    updateDto: UpdateCoursePricingDto,
    updatedBy: string,
  ): Promise<CoursePricingResult> {
    const course = await manager.getRepository(Course).findOne({
      where: { id: courseId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!course) throw new NotFoundException('Course not found');

    const next = resolveNextPricing(course, updateDto);
    const transition = classifyTransition(course, next);
    if (transition === PricingTransition.UNCHANGED)
      return { courseId, ...next, transition, cancelledPendingOrders: 0 };

    // PAID -> FREE: nothing left to pay for. COMPLETED orders and existing
    // enrollments are untouched; PENDING orders keep their snapshot otherwise.
    let cancelledPendingOrders = 0;
    if (transition === PricingTransition.PAID_TO_FREE) {
      const cancelled = await manager
        .getRepository(Order)
        .createQueryBuilder()
        .update()
        .set({ status: OrderStatus.CANCELLED })
        .where('course_id = :courseId', { courseId })
        .andWhere('status = :status', { status: OrderStatus.PENDING })
        .execute();
      cancelledPendingOrders = cancelled.affected ?? 0;
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
