import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import {
  CoursePublishabilityValidator,
  isLessonContentValid,
  type PublishableLessonContent,
} from './course-publishability.validator.js';
import { CourseStatus } from './course-status.js';
import { Course } from './course.entity.js';
import { Chapter } from './chapter.entity.js';
import { Enrollment } from './enrollment.entity.js';
import { EnrollmentService } from './enrollment.service.js';
import { CourseAccessType } from './course-access-type.js';
import type { CourseCurrency } from './course-currency.js';
import { CoursePricingService } from './pricing/course-pricing.service.js';
import {
  assertCourseTransition,
  InvalidCourseTransitionError,
} from './course-lifecycle.js';
import type { CreateCourseDto, UpdateCourseDto } from './courses.dto.js';
import type { Principal } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.module.js';
import { User } from '../users/user.entity.js';
import type { PublicCourseQueryDto } from './public-courses.dto.js';

interface PublicCourseRow {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnail: string | null;
  publishedAt: Date | null;
  instructorId: string | null;
  instructorDisplayName: string | null;
  instructorAvatarKey: string | null;
}

interface PublicCourseDetailRow {
  courseId: string;
  title: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  thumbnail: string | null;
  publishedAt: Date | null;
  isSequential: boolean;
  accessType: CourseAccessType;
  // bigint arrives as a string from the raw query.
  price: string;
  currency: CourseCurrency;
  instructorId: string | null;
  instructorDisplayName: string | null;
  instructorAvatarKey: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterDescription: string | null;
  chapterPosition: number | null;
}

const uniqueViolation = (error: unknown) =>
  (error as { code?: string })?.code === '23505';

@Injectable()
export class CoursesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly publishability: CoursePublishabilityValidator,
    private readonly enrollments: EnrollmentService,
    private readonly pricing: CoursePricingService,
  ) {}

  enroll(userId: string, courseId: string) {
    return this.enrollments.enrollCourse(userId, courseId);
  }

  async enrollmentStatus(userId: string, courseId: string) {
    const course = await this.database.dataSource
      .getRepository(Course)
      .findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');

    const enrollment = await this.database.dataSource
      .getRepository(Enrollment)
      .findOneBy({ userId, courseId, revokedAt: IsNull() });
    return enrollment
      ? { isEnrolled: true, enrolledAt: enrollment.enrolledAt }
      : { isEnrolled: false };
  }

  async create(principal: Principal, dto: CreateCourseDto) {
    const repository = this.database.dataSource.getRepository(Course);
    try {
      return await repository.save(
        repository.create({
          category: dto.category,
          level: dto.level,
          language: dto.language,
          price: dto.price ?? 0,
          accessType: dto.price ? CourseAccessType.PAID : CourseAccessType.FREE,
          instructorId: principal.id,
          title: dto.title,
          slug: dto.slug,
          description: dto.description,
          shortDescription: dto.shortDescription,
          thumbnail: dto.thumbnail,
          ownerId: principal.id,
          status: CourseStatus.DRAFT,
        }),
      );
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException('Course slug already exists');
      throw error;
    }
  }

  async update(course: Course, dto: UpdateCourseDto, updatedBy: string) {
    const { price, ...fields } = dto;
    try {
      // Price edits go through the pricing engine (audit log, PENDING order
      // cancellation) in the same transaction as the other field changes.
      await this.database.dataSource.transaction(async (manager) => {
        if (price !== undefined)
          await this.pricing.applyPricing(
            manager,
            course.id,
            {
              accessType:
                price > 0 ? CourseAccessType.PAID : CourseAccessType.FREE,
              price,
            },
            updatedBy,
          );
        if (Object.keys(fields).length)
          await manager.getRepository(Course).update({ id: course.id }, fields);
      });
      return await this.database.dataSource
        .getRepository(Course)
        .findOneByOrFail({ id: course.id });
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException('Course slug already exists');
      throw error;
    }
  }

  async publish(id: string) {
    return this.database.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Course);
      const course = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');
      this.assertTransition(course.status, CourseStatus.PUBLISHED);

      const [facts] = await manager.query(
        `SELECT
          ((SELECT count(*) FROM course_sections WHERE course_id = $1) + (SELECT count(*) FROM chapters WHERE course_id = $1))::integer AS section_count,
          (SELECT count(*) FROM course_sections AS section
            WHERE section.course_id = $1
              AND NOT EXISTS (
                SELECT 1 FROM lessons
                WHERE lessons.section_id = section.id
                  AND lessons.course_id = section.course_id
              ))::integer + (SELECT count(*) FROM chapters c WHERE c.course_id = $1 AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.chapter_id = c.id))::integer AS sections_without_lessons,
          (SELECT count(*) FROM lessons WHERE course_id = $1)::integer AS lesson_count`,
        [id],
      );
      const lessonContent = await manager.query<PublishableLessonContent[]>(
        `SELECT type,
          text_body AS "textBody",
          video_asset_id AS "videoAssetId",
          video_external_url AS "videoExternalUrl",
          document_asset_id AS "documentAssetId"
        FROM lessons
        WHERE course_id = $1`,
        [id],
      );
      const errors = this.publishability.validate(course, {
        sectionCount: Number(facts.section_count),
        sectionsWithoutLessons: Number(facts.sections_without_lessons),
        lessonCount: Number(facts.lesson_count),
        lessonsWithoutContent: lessonContent.filter(
          (lesson) => !isLessonContentValid(lesson),
        ).length,
      });
      if (errors.length)
        throw new BadRequestException({
          message: 'Course is not ready to publish',
          errors,
        });

      course.status = CourseStatus.PUBLISHED;
      course.publishedAt = new Date();
      return repository.save(course);
    });
  }

  async unpublish(id: string) {
    return this.database.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Course);
      const course = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');
      this.assertTransition(course.status, CourseStatus.DRAFT);
      course.status = CourseStatus.DRAFT;
      course.publishedAt = null;
      return repository.save(course);
    });
  }

  async archive(id: string) {
    return this.database.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Course);
      const course = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');
      this.assertTransition(course.status, CourseStatus.ARCHIVED);
      course.status = CourseStatus.ARCHIVED;
      return repository.save(course);
    });
  }

  async listPublic({
    page,
    limit,
    search,
    instructorId,
    sortBy,
    sortOrder,
  }: PublicCourseQueryDto) {
    const query = this.database.dataSource
      .getRepository(Course)
      .createQueryBuilder('course')
      .leftJoin(User, 'instructor', 'instructor.id = course.instructorId')
      .where('course.status = :publishedStatus', {
        publishedStatus: CourseStatus.PUBLISHED,
      });
    if (search) {
      query.andWhere(
        '(course.title ILIKE :search OR course.shortDescription ILIKE :search)',
        { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }
    if (instructorId)
      query.andWhere('course.instructorId = :instructorId', { instructorId });

    const total = await query.clone().getCount();
    const sortColumn =
      sortBy === 'createdAt' ? 'course.createdAt' : 'course.publishedAt';
    const rows = await query
      .select('course.id', 'id')
      .addSelect('course.title', 'title')
      .addSelect('course.slug', 'slug')
      .addSelect('course.shortDescription', 'shortDescription')
      .addSelect('course.thumbnail', 'thumbnail')
      .addSelect('course.publishedAt', 'publishedAt')
      .addSelect('instructor.id', 'instructorId')
      .addSelect('instructor.displayName', 'instructorDisplayName')
      .addSelect('instructor.avatarKey', 'instructorAvatarKey')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('course.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<PublicCourseRow>();

    return {
      data: rows.map((course) => ({
        id: course.id,
        title: course.title,
        slug: course.slug,
        shortDescription: course.shortDescription,
        thumbnail: course.thumbnail,
        publishedAt: course.publishedAt,
        instructor: course.instructorId
          ? {
              id: course.instructorId,
              displayName: course.instructorDisplayName,
              avatar: course.instructorAvatarKey
                ? `/avatars/${course.instructorAvatarKey}`
                : null,
            }
          : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPublicBySlug(slug: string) {
    const rows = await this.database.dataSource
      .getRepository(Course)
      .createQueryBuilder('course')
      .leftJoin(
        User,
        'instructor',
        'instructor.id = COALESCE(course.instructorId, course.ownerId)',
      )
      .leftJoin(Chapter, 'chapter', 'chapter.courseId = course.id')
      .select('course.id', 'courseId')
      .addSelect('course.title', 'title')
      .addSelect('course.slug', 'slug')
      .addSelect('course.description', 'description')
      .addSelect('course.shortDescription', 'shortDescription')
      .addSelect('course.thumbnail', 'thumbnail')
      .addSelect('course.publishedAt', 'publishedAt')
      .addSelect('course.isSequential', 'isSequential')
      .addSelect('course.accessType', 'accessType')
      .addSelect('course.price', 'price')
      .addSelect('course.currency', 'currency')
      .addSelect('instructor.id', 'instructorId')
      .addSelect('instructor.displayName', 'instructorDisplayName')
      .addSelect('instructor.avatarKey', 'instructorAvatarKey')
      .addSelect('chapter.id', 'chapterId')
      .addSelect('chapter.title', 'chapterTitle')
      .addSelect('chapter.description', 'chapterDescription')
      .addSelect('chapter.position', 'chapterPosition')
      .where('course.slug = :slug', { slug })
      .andWhere('course.status = :publishedStatus', {
        publishedStatus: CourseStatus.PUBLISHED,
      })
      .orderBy('chapter.position', 'ASC')
      .addOrderBy('chapter.id', 'ASC')
      .getRawMany<PublicCourseDetailRow>();

    if (!rows.length) throw new NotFoundException('Course not found');
    const course = rows[0]!;
    return {
      course: {
        id: course.courseId,
        title: course.title,
        slug: course.slug,
        description: course.description,
        shortDescription: course.shortDescription,
        thumbnail: course.thumbnail,
        publishedAt: course.publishedAt,
        isSequential: course.isSequential === true,
        accessType: course.accessType,
        price: Number(course.price),
        currency: course.currency,
      },
      instructor: course.instructorId
        ? {
            id: course.instructorId,
            displayName: course.instructorDisplayName,
            avatar: course.instructorAvatarKey
              ? `/avatars/${course.instructorAvatarKey}`
              : null,
            bio: null,
          }
        : null,
      curriculum: rows
        .filter((row) => row.chapterId !== null)
        .map((row) => ({
          id: row.chapterId,
          title: row.chapterTitle,
          description: row.chapterDescription,
          orderIndex: row.chapterPosition,
        })),
    };
  }

  async getPublicSyllabus(slug: string) {
    const detail = await this.getPublicBySlug(slug);
    const lessons = await this.database.dataSource.query<
      {
        id: string;
        chapterId: string;
        title: string;
        slug: string;
        type: string;
        position: number;
        isPreview: boolean;
        isRequired: boolean;
      }[]
    >(
      `SELECT lesson.id,
          lesson.chapter_id AS "chapterId",
          lesson.title,
          lesson.slug,
          lesson.type,
          lesson.position,
          lesson.is_preview AS "isPreview",
          lesson.is_required AS "isRequired"
        FROM lessons lesson
        INNER JOIN courses course ON course.id = lesson.course_id
        WHERE course.id = $1
          AND course.status = $2
          AND lesson.is_published = true
        ORDER BY lesson.position ASC, lesson.id ASC`,
      [detail.course.id, CourseStatus.PUBLISHED],
    );
    const byChapter = new Map<string, typeof lessons>();
    for (const lesson of lessons) {
      const chapterLessons = byChapter.get(lesson.chapterId) ?? [];
      chapterLessons.push(lesson);
      byChapter.set(lesson.chapterId, chapterLessons);
    }
    return {
      ...detail,
      curriculum: detail.curriculum.map((chapter) => ({
        ...chapter,
        lessons: (byChapter.get(chapter.id!) ?? []).map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          slug: lesson.slug,
          type: lesson.type,
          position: lesson.position,
          isPreview: lesson.isPreview,
          isRequired: lesson.isRequired,
        })),
      })),
    };
  }
  private assertTransition(current: CourseStatus, next: CourseStatus) {
    try {
      assertCourseTransition(current, next);
    } catch (error) {
      if (error instanceof InvalidCourseTransitionError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  list(principal: Principal) {
    const query = this.database.dataSource
      .getRepository(Course)
      .createQueryBuilder('course');
    if (principal.roles.includes('admin')) {
      return query
        .orderBy('course.createdAt', 'DESC')
        .addOrderBy('course.id', 'DESC')
        .getMany();
    }
    if (principal.roles.includes('instructor')) {
      query.where('course.ownerId = :ownerId', { ownerId: principal.id });
    } else {
      query.where('course.status = :status', {
        status: CourseStatus.PUBLISHED,
      });
    }
    return query
      .orderBy('course.createdAt', 'DESC')
      .addOrderBy('course.id', 'DESC')
      .getMany();
  }
}
