import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { Enrollment } from '../../courses/enrollment.entity.js';
import { Lesson, LessonType } from '../lessons/entities/lesson.entity.js';
import { LessonProgress, ProgressStatus } from './lesson-progress.entity.js';
import type { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { IsNull } from 'typeorm';

@Injectable()
export class ProgressService {
  constructor(private readonly database: DatabaseService) {}

  private async lessonForStudent(userId: string, lessonId: string) {
    const lesson = await this.database.dataSource
      .getRepository(Lesson)
      .findOneBy({ id: lessonId });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const enrollment = await this.database.dataSource
      .getRepository(Enrollment)
      .findOneBy({
        userId,
        courseId: lesson.courseId,
        revokedAt: IsNull(),
      });
    if (!enrollment) throw new ForbiddenException('Active enrollment required');
    return lesson;
  }

  async start(userId: string, lessonId: string) {
    const lesson = await this.lessonForStudent(userId, lessonId);
    await this.database.dataSource.query(
      `INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position, started_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, now())
       ON CONFLICT (user_id, lesson_id) DO NOTHING`,
      [userId, lesson.id, lesson.courseId, ProgressStatus.IN_PROGRESS],
    );
    return this.find(userId, lesson.id);
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

  async videoProgress(userId: string, lessonId: string, dto: VideoProgressDto) {
    const lesson = await this.lessonForStudent(userId, lessonId);
    if (lesson.type !== LessonType.VIDEO)
      throw new BadRequestException('Lesson is not a video');
    await this.start(userId, lessonId);
    if (dto.ended || dto.percentage >= 85)
      return this.markCompleted(userId, lesson, dto.seconds);
    await this.database.dataSource.query(
      `UPDATE lesson_progress SET last_position = GREATEST(last_position, $3)
       WHERE user_id = $1 AND lesson_id = $2`,
      [userId, lessonId, dto.seconds],
    );
    return this.find(userId, lessonId);
  }

  async courseProgress(userId: string, courseId: string) {
    const enrollment = await this.database.dataSource
      .getRepository(Enrollment)
      .findOneBy({
        userId,
        courseId,
        revokedAt: IsNull(),
      });
    if (!enrollment) throw new ForbiddenException('Active enrollment required');
    const rows = (await this.database.dataSource.query(
      `SELECT lesson.id AS "lessonId", COALESCE(progress.status, $3) AS status,
              COALESCE(progress.last_position, 0)::int AS "lastPosition",
              progress.started_at AS "startedAt", progress.completed_at AS "completedAt"
       FROM lessons lesson
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id AND progress.user_id = $1
       WHERE lesson.course_id = $2 AND lesson.is_published = true
       ORDER BY lesson.position`,
      [userId, courseId, ProgressStatus.NOT_STARTED],
    )) as Array<{
      lessonId: string;
      status: ProgressStatus;
      lastPosition: number;
    }>;
    const completedLessonsCount = rows.filter(
      (row) => row.status === ProgressStatus.COMPLETED,
    ).length;
    return {
      courseId,
      completedLessonsCount,
      totalLessonsCount: rows.length,
      percentage: rows.length ? (completedLessonsCount / rows.length) * 100 : 0,
      lessons: rows,
    };
  }

  private async markCompleted(
    userId: string,
    lesson: Lesson,
    lastPosition = 0,
  ) {
    await this.start(userId, lesson.id);
    await this.database.dataSource.query(
      `UPDATE lesson_progress SET status = $3, completed_at = COALESCE(completed_at, now()),
         last_position = GREATEST(last_position, $4)
       WHERE user_id = $1 AND lesson_id = $2`,
      [userId, lesson.id, ProgressStatus.COMPLETED, lastPosition],
    );
    return this.find(userId, lesson.id);
  }

  private find(userId: string, lessonId: string) {
    return this.database.dataSource
      .getRepository(LessonProgress)
      .findOneByOrFail({ userId, lessonId });
  }
}
