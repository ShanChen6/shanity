import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { Lesson, LessonType } from '../lessons/entities/lesson.entity.js';
import {
  LessonProgress,
  LessonProgressStatus,
} from './entities/lesson-progress.entity.js';
import type { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import type { UpdateProgressDto } from './dto/update-progress.dto.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { EnrollmentPolicy } from './services/enrollment-policy.js';

@Injectable()
export class ProgressService {
  constructor(
    private readonly database: DatabaseService,
    private readonly progressCalculator: CourseProgressCalculatorService,
    private readonly enrollments: EnrollmentPolicy,
  ) {}

  private async lessonForStudent(userId: string, lessonId: string) {
    const lesson = await this.database.dataSource
      .getRepository(Lesson)
      .findOneBy({ id: lessonId });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.enrollments.requireActive(userId, lesson.courseId);
    return lesson;
  }

  async start(userId: string, lessonId: string) {
    const lesson = await this.lessonForStudent(userId, lessonId);
    await this.database.dataSource.query(
      `WITH saved_progress AS (
       INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position, started_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, now())
       ON CONFLICT (user_id, lesson_id) DO UPDATE
         SET last_accessed_at = CURRENT_TIMESTAMP
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`,
      [userId, lesson.id, lesson.courseId, LessonProgressStatus.IN_PROGRESS],
    );
    return this.find(userId, lesson.id);
  }

  async startLesson(userId: string, lessonId: string) {
    const progress = await this.start(userId, lessonId);
    return {
      progress,
      courseProgress: await this.calculateCourseProgress(
        userId,
        progress.courseId,
      ),
    };
  }

  async updateHeartbeat(
    userId: string,
    lessonId: string,
    dto: UpdateProgressDto,
  ) {
    const lesson = await this.lessonForStudent(userId, lessonId);
    await this.database.dataSource.query(
      `WITH saved_progress AS (
       INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position, started_at, last_accessed_at)
       VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         last_position = EXCLUDED.last_position,
         last_accessed_at = CURRENT_TIMESTAMP
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`,
      [
        userId,
        lesson.id,
        lesson.courseId,
        LessonProgressStatus.IN_PROGRESS,
        dto.lastPosition,
      ],
    );
    const progress = await this.find(userId, lesson.id);
    return {
      progress,
      courseProgress: await this.calculateCourseProgress(
        userId,
        lesson.courseId,
      ),
    };
  }

  async complete(
    userId: string,
    lessonId: string,
    evidence: CompleteLessonDto,
  ) {
    const lesson = await this.lessonForStudent(userId, lessonId);
    if (lesson.type === LessonType.VIDEO)
      throw new BadRequestException(
        'Video lessons complete through video progress',
      );
    if (
      lesson.type === LessonType.TEXT &&
      (evidence.scrollPercentage ?? 0) < 80
    )
      throw new BadRequestException('Read at least 80% before completing');
    if (
      lesson.type === LessonType.DOCUMENT &&
      !(lesson.documentDownloadAllowed && evidence.downloaded) &&
      !evidence.reachedLastPage
    )
      throw new BadRequestException('View the final page before completing');
    return this.markCompleted(userId, lesson);
  }

  async completeLesson(
    userId: string,
    lessonId: string,
    evidence: CompleteLessonDto,
  ) {
    const progress = await this.complete(userId, lessonId, evidence);
    return {
      progress,
      courseProgress: await this.calculateCourseProgress(
        userId,
        progress.courseId,
      ),
    };
  }

  async videoProgress(userId: string, lessonId: string, dto: VideoProgressDto) {
    const lesson = await this.lessonForStudent(userId, lessonId);
    if (lesson.type !== LessonType.VIDEO)
      throw new BadRequestException('Lesson is not a video');
    await this.start(userId, lessonId);
    if (dto.ended || dto.percentage >= 85) {
      const progress = await this.markCompleted(userId, lesson, dto.seconds);
      return {
        progress,
        courseProgress: await this.calculateCourseProgress(
          userId,
          lesson.courseId,
        ),
      };
    }
    await this.database.dataSource.query(
      `WITH saved_progress AS (
       UPDATE lesson_progress SET
         last_position = GREATEST(COALESCE(last_position, 0), $4),
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND lesson_id = $2
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`,
      [userId, lessonId, lesson.courseId, dto.seconds],
    );
    const progress = await this.find(userId, lessonId);
    return {
      progress,
      courseProgress: await this.calculateCourseProgress(
        userId,
        lesson.courseId,
      ),
    };
  }

  async courseProgress(userId: string, courseId: string) {
    await this.enrollments.requireActive(userId, courseId);
    const rows = (await this.database.dataSource.query(
      `SELECT lesson.id AS "lessonId", COALESCE(progress.status::text, $3) AS status,
              lesson.is_required AS "isRequired",
              COALESCE(progress.last_position, 0)::int AS "lastPosition",
              progress.started_at AS "startedAt", progress.completed_at AS "completedAt"
       FROM lessons lesson
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id AND progress.user_id = $1
       WHERE lesson.course_id = $2 AND lesson.is_published = true
       ORDER BY lesson.position`,
      [userId, courseId, 'NOT_STARTED'],
    )) as Array<{
      lessonId: string;
      status: LessonProgressStatus | 'NOT_STARTED';
      isRequired: boolean;
      lastPosition: number | null;
    }>;
    return Object.assign(
      await this.progressCalculator.calculate(userId, courseId),
      { lessons: rows },
    );
  }

  // Called after every progress write: drop the student's cached summary so
  // this response and every other device/tab read the new numbers.
  async calculateCourseProgress(userId: string, courseId: string) {
    await this.progressCalculator.invalidateStudentProgress(userId, courseId);
    return this.progressCalculator.calculate(userId, courseId);
  }

  private async markCompleted(
    userId: string,
    lesson: Lesson,
    lastPosition = 0,
  ) {
    await this.database.dataSource.query(
      `WITH saved_progress AS (
       INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position,
         started_at, last_accessed_at, completed_at)
       VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, $5,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         status = $4,
         completed_at = COALESCE(lesson_progress.completed_at, CURRENT_TIMESTAMP),
         last_position = GREATEST(COALESCE(lesson_progress.last_position, 0), $5),
         last_accessed_at = CURRENT_TIMESTAMP
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`,
      [
        userId,
        lesson.id,
        lesson.courseId,
        LessonProgressStatus.COMPLETED,
        lastPosition,
      ],
    );
    return this.find(userId, lesson.id);
  }

  private find(userId: string, lessonId: string) {
    return this.database.dataSource
      .getRepository(LessonProgress)
      .findOneByOrFail({ userId, lessonId });
  }
}
