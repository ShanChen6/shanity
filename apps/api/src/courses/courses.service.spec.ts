import { ConflictException } from '@nestjs/common';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';
import { CourseStatus } from './course-status.js';
import { Course } from './course.entity.js';
import { CoursesService } from './courses.service.js';
import { DatabaseService } from '../database/database.module.js';

describe('CoursesService enrollment', () => {
  it('stores only one enrollment when requests race', async () => {
    const course = {
      id: 'course-id',
      status: CourseStatus.PUBLISHED,
      price: 0,
    };
    const stored = new Map<string, { id: string; enrolledAt: Date }>();
    const courseRepository = {
      findOneBy: vi.fn().mockResolvedValue(course),
    };
    const enrollmentRepository = {
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn((values: object) => values),
      save: vi.fn(async (values: object) => {
        const key = 'user-id:course-id';
        if (stored.has(key)) {
          throw Object.assign(new Error('Duplicate enrollment'), {
            code: '23505',
            constraint: 'enrollments_user_id_course_id_key',
          });
        }
        const enrollment = { id: 'enrollment-id', enrolledAt: new Date() };
        stored.set(key, enrollment);
        return { ...values, ...enrollment };
      }),
    };
    const database = {
      dataSource: {
        getRepository: vi.fn((entity: unknown) =>
          entity === Course ? courseRepository : enrollmentRepository,
        ),
      },
    } as unknown as DatabaseService;
    const service = new CoursesService(
      database,
      {} as CoursePublishabilityValidator,
    );

    const results = await Promise.allSettled([
      service.enroll('user-id', 'course-id'),
      service.enroll('user-id', 'course-id'),
    ]);

    expect(stored).toHaveLength(1);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    expect(rejected?.reason.getStatus()).toBe(409);
  });

  it('returns a conflict for an existing enrollment before saving', async () => {
    const courseRepository = {
      findOneBy: vi.fn().mockResolvedValue({
        id: 'course-id',
        status: CourseStatus.PUBLISHED,
        price: 0,
      }),
    };
    const enrollmentRepository = {
      findOneBy: vi.fn().mockResolvedValue({ id: 'existing-enrollment' }),
      create: vi.fn(),
      save: vi.fn(),
    };
    const database = {
      dataSource: {
        getRepository: vi.fn((entity: unknown) =>
          entity === Course ? courseRepository : enrollmentRepository,
        ),
      },
    } as unknown as DatabaseService;
    const service = new CoursesService(
      database,
      {} as CoursePublishabilityValidator,
    );

    await expect(service.enroll('user-id', 'course-id')).rejects.toMatchObject({
      status: 409,
    });
    expect(enrollmentRepository.save).not.toHaveBeenCalled();
  });
});
