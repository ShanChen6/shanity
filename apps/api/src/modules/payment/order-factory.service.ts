import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CourseAccessType } from '../../courses/course-access-type.js';
import { CourseStatus } from '../../courses/course-status.js';
import { Course } from '../../courses/course.entity.js';
import { Enrollment } from '../../courses/enrollment.entity.js';
import { DatabaseService } from '../../database/database.module.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import {
  buildOrderSnapshot,
  generateOrderCode,
  ORDER_TTL_MS,
  type OrderSnapshot,
} from './order-snapshot.js';
import { toOrderView, type OrderView } from './order-view.js';
import type { CreateOrderDto } from './payment.dto.js';

const CODE_ATTEMPTS = 5;

/** Override point so tests can force order-code collisions. */
export const ORDER_CODE_GENERATOR = Symbol('ORDER_CODE_GENERATOR');
export type OrderCodeGenerator = () => string;

const isOrderCodeCollision = (error: unknown) => {
  const databaseError = error as { code?: string; constraint?: string };
  return (
    databaseError?.code === '23505' &&
    databaseError.constraint === 'orders_code_key'
  );
};

@Injectable()
export class OrderFactoryService {
  constructor(
    private readonly database: DatabaseService,
    @Optional()
    @Inject(ORDER_CODE_GENERATOR)
    private readonly nextCode: OrderCodeGenerator = () => generateOrderCode(),
  ) {}

  /**
   * Creates a PENDING order whose prices and titles are frozen copies of the
   * courses at this instant. The order header, its items and the totals are
   * written in one transaction; a code collision (rare, 32^4 per day) retries
   * the whole transaction with a fresh code.
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderView> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.database.dataSource.transaction((manager) =>
          this.createInTransaction(manager, userId, dto.courseIds),
        );
      } catch (error) {
        if (!isOrderCodeCollision(error)) throw error;
        if (attempt >= CODE_ATTEMPTS)
          throw new ConflictException('ORDER_CODE_GENERATION_FAILED');
      }
    }
  }

  private async createInTransaction(
    manager: EntityManager,
    userId: string,
    courseIds: readonly string[],
  ): Promise<OrderView> {
    const courses = await this.lockPurchasableCourses(manager, courseIds);
    await this.assertNotEnrolled(manager, userId, courseIds);

    // `courseIds` order defines the item order the buyer sees.
    const byId = new Map(courses.map((course) => [course.id, course]));
    const snapshot = buildOrderSnapshot(
      courseIds.map((courseId) => byId.get(courseId)!),
    );
    return this.persist(manager, userId, snapshot);
  }

  /**
   * Reads the courses FOR SHARE, in id order. A concurrent repricing holds
   * FOR NO KEY UPDATE on the same row, so the snapshot is taken either wholly
   * before or wholly after that change. Sorting the lock order keeps two
   * multi-course checkouts from deadlocking each other.
   */
  private async lockPurchasableCourses(
    manager: EntityManager,
    courseIds: readonly string[],
  ) {
    if (new Set(courseIds).size !== courseIds.length)
      throw new BadRequestException('DUPLICATE_COURSE_IN_ORDER');
    const courses = await manager
      .getRepository(Course)
      .createQueryBuilder('course')
      .setLock('pessimistic_read')
      .where('course.id IN (:...courseIds)', { courseIds })
      .orderBy('course.id', 'ASC')
      .getMany();
    if (
      courses.length !== courseIds.length ||
      courses.some((course) => course.status !== CourseStatus.PUBLISHED)
    )
      throw new NotFoundException('COURSE_NOT_FOUND');
    if (courses.some((course) => course.accessType !== CourseAccessType.PAID))
      throw new BadRequestException('COURSE_IS_FREE');
    return courses;
  }

  private async assertNotEnrolled(
    manager: EntityManager,
    userId: string,
    courseIds: readonly string[],
  ) {
    const enrolled = await manager
      .getRepository(Enrollment)
      .createQueryBuilder('enrollment')
      .where('enrollment.user_id = :userId', { userId })
      .andWhere('enrollment.course_id IN (:...courseIds)', { courseIds })
      .getExists();
    if (enrolled) throw new BadRequestException('ALREADY_ENROLLED');
  }

  private async persist(
    manager: EntityManager,
    userId: string,
    snapshot: OrderSnapshot,
  ): Promise<OrderView> {
    const orders = manager.getRepository(Order);
    const order = await orders.save(
      orders.create({
        code: this.nextCode(),
        userId,
        status: OrderStatus.PENDING,
        currency: snapshot.currency,
        subtotal: snapshot.subtotal,
        discountTotal: snapshot.discountTotal,
        finalTotal: snapshot.finalTotal,
        paymentProvider: null,
        expiresAt: new Date(Date.now() + ORDER_TTL_MS),
      }),
    );
    const items = manager.getRepository(OrderItem);
    const saved = await items.save(
      snapshot.items.map((item) =>
        items.create({ ...item, orderId: order.id }),
      ),
    );
    return toOrderView(order, saved);
  }
}
