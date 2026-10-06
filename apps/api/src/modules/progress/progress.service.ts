import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Enrollment } from '../../courses/enrollment.entity.js';
import { Lesson, LessonType } from '../lessons/entities/lesson.entity.js';
import {
  LessonProgress,
  LessonProgressStatus,
} from './entities/lesson-progress.entity.js';
import type { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import {
  completeTransition,
  CompletionCriteriaError,
  startTransition,
} from './progress-lifecycle.js';

@Injectable()
export class ProgressService {
  constructor(private readonly dataSource: DataSource) {}

  private async context(
    manager: EntityManager,
    userId: string,
    lessonId: string,
  ) {
    const lesson = await manager
      .getRepository(Lesson)
      .findOneBy({ id: lessonId });
    if (!lesson || !lesson.isPublished)
      throw new NotFoundException('Lesson not found');
    const enrollment = await manager.getRepository(Enrollment).findOne({
      where: { userId, courseId: lesson.courseId, revokedAt: IsNull() },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException('Active enrollment required');
    return { lesson, enrollmentId: enrollment.id };
  }

  private async getOrCreate(
    manager: EntityManager,
    userId: string,
    lesson: Lesson,
    enrollmentId: string,
  ) {
    const repository = manager.getRepository(LessonProgress);
    let progress = await repository.findOne({
      where: { userId, lessonId: lesson.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!progress) {
      progress = await repository.save(
        repository.create({
          userId,
          enrollmentId,
          lessonId: lesson.id,
          courseId: lesson.courseId,
          status: LessonProgressStatus.NOT_STARTED,
          lastPosition: 0,
        }),
      );
    }
    return progress;
  }

  start(userId: string, lessonId: string) {
    return this.dataSource.transaction(async (manager) => {
      const { lesson, enrollmentId } = await this.context(
        manager,
        userId,
        lessonId,
      );
      const progress = await this.getOrCreate(
        manager,
        userId,
        lesson,
        enrollmentId,
      );
      const next = startTransition(progress.status);
      if (next !== progress.status) {
        progress.status = next;
        progress.startedAt = new Date();
        await manager.getRepository(LessonProgress).save(progress);
      }
      return progress;
    });
  }

  complete(userId: string, lessonId: string, dto: CompleteLessonDto) {
    return this.dataSource.transaction(async (manager) => {
      const { lesson, enrollmentId } = await this.context(
        manager,
        userId,
        lessonId,
      );
      if (lesson.type === LessonType.VIDEO)
        throw new BadRequestException('Use video-progress for video lessons');
      const progress = await this.getOrCreate(
        manager,
        userId,
        lesson,
        enrollmentId,
      );
      try {
        completeTransition(progress.status, lesson.type, {
          percentage: dto.percentage,
          explicit: true,
          reachedLastPage: dto.reachedLastPage,
          documentDownloaded: dto.downloaded,
          downloadAllowed: lesson.documentDownloadAllowed ?? false,
        });
      } catch (error) {
        if (error instanceof CompletionCriteriaError)
          throw new BadRequestException(error.message);
        throw error;
      }
      if (progress.status !== LessonProgressStatus.COMPLETED) {
        progress.status = LessonProgressStatus.COMPLETED;
        progress.startedAt ??= new Date();
        progress.completedAt = new Date();
        await manager.getRepository(LessonProgress).save(progress);
      }
      return progress;
    });
  }

  videoProgress(userId: string, lessonId: string, dto: VideoProgressDto) {
    return this.dataSource.transaction(async (manager) => {
      const { lesson, enrollmentId } = await this.context(
        manager,
        userId,
        lessonId,
      );
      if (lesson.type !== LessonType.VIDEO)
        throw new BadRequestException('Lesson is not a video');
      const progress = await this.getOrCreate(
        manager,
        userId,
        lesson,
        enrollmentId,
      );
      progress.startedAt ??= new Date();
      if (progress.status === LessonProgressStatus.NOT_STARTED)
        progress.status = LessonProgressStatus.IN_PROGRESS;
      // Never move a resume point backwards because heartbeats can arrive out of order.
      progress.lastPosition = Math.max(progress.lastPosition, dto.seconds);
      try {
        const next = completeTransition(progress.status, lesson.type, {
          percentage: dto.percentage,
          videoEnded: dto.ended,
        });
        if (
          next === LessonProgressStatus.COMPLETED &&
          progress.status !== next
        ) {
          progress.status = next;
          progress.completedAt = new Date();
        }
      } catch (error) {
        if (!(error instanceof CompletionCriteriaError)) throw error;
      }
      return manager.getRepository(LessonProgress).save(progress);
    });
  }

  async courseProgress(userId: string, courseId: string) {
    const enrollment = await this.dataSource
      .getRepository(Enrollment)
      .findOneBy({
        userId,
        courseId,
        revokedAt: IsNull(),
      });
    if (!enrollment) throw new ForbiddenException('Active enrollment required');
    const rows = await this.dataSource.query<
      { lessonId: string; status: LessonProgressStatus }[]
    >(
      `SELECT lesson.id AS "lessonId",
              COALESCE(progress.status, 'NOT_STARTED'::"LessonProgressStatus") AS status
       FROM lessons lesson
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id AND progress.user_id = $1
       WHERE lesson.course_id = $2 AND lesson.is_published = true
       ORDER BY lesson.chapter_id, lesson.position, lesson.id`,
      [userId, courseId],
    );
    const completedLessonsCount = rows.filter(
      ({ status }) => status === LessonProgressStatus.COMPLETED,
    ).length;
    const totalLessonsCount = rows.length;
    return {
      courseId,
      completedLessonsCount,
      totalLessonsCount,
      percentage:
        totalLessonsCount === 0
          ? 0
          : (completedLessonsCount / totalLessonsCount) * 100,
      lessons: rows,
    };
  }
}
