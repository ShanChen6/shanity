import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DatabaseService } from '../database/database.module.js';
import { CourseAccessType } from './course-access-type.js';
import { CourseStatus } from './course-status.js';
import { Course } from './course.entity.js';
import { Enrollment } from './enrollment.entity.js';
import { PaymentRequiredException } from './payment-required.exception.js';

const isEnrollmentUniqueViolation = (error: unknown) => {
  const databaseError = error as { code?: string; constraint?: string };
  return (
    databaseError.code === '23505' &&
    databaseError.constraint === 'enrollments_user_id_course_id_key'
  );
};

@Injectable()
export class EnrollmentService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * FREE fast-path only: creates the enrollment directly. PAID courses never
   * enroll here; they must go through Order -> Payment -> Enrollment, which is
   * completed server-side by the verified bank webhook.
   */
  async enrollCourse(userId: string, courseId: string) {
    const course = await this.database.dataSource
      .getRepository(Course)
      .findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== CourseStatus.PUBLISHED)
      throw new ConflictException('Course is not published');
    if (course.accessType !== CourseAccessType.FREE)
      throw new PaymentRequiredException(course.id);

    const enrollments = this.database.dataSource.getRepository(Enrollment);
    const existing = await enrollments.findOneBy({
      userId,
      courseId,
      revokedAt: IsNull(),
    });
    if (existing) throw new ConflictException('Already enrolled');

    try {
      const enrollment = await enrollments.save(
        enrollments.create({ userId, courseId }),
      );
      return {
        message: 'Enrolled successfully',
        enrollmentId: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
      };
    } catch (error) {
      if (isEnrollmentUniqueViolation(error))
        throw new ConflictException('Already enrolled');
      throw error;
    }
  }
}
