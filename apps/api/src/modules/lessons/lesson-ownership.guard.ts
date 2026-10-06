import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthRequest } from '../../auth/auth.guards.js';
import { Chapter } from '../../courses/chapter.entity.js';
import { Course } from '../../courses/course.entity.js';
import { Lesson } from './entities/lesson.entity.js';

const FORBIDDEN_MESSAGE = 'You do not have permission to modify this lesson';

type OwnershipRow = { instructorId: string | null };

@Injectable()
export class LessonOwnershipGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const params = request.params as Record<string, string | undefined>;
    const chapterId = params.chapterId;
    const lessonId = params.lessonId ?? params.id;

    const ownership =
      chapterId && isUUID(chapterId, '4')
        ? await this.findChapterOwnership(chapterId)
        : lessonId && isUUID(lessonId, '4')
          ? await this.findLessonOwnership(lessonId)
          : undefined;

    // Resolve the complete server-side chain even for administrators. This
    // prevents malformed or missing resources from bypassing the route guard.
    if (!ownership) throw new ForbiddenException(FORBIDDEN_MESSAGE);
    if (request.principal.roles.includes('admin')) return true;
    if (
      request.principal.roles.includes('instructor') &&
      ownership.instructorId === request.principal.id
    )
      return true;

    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  private findChapterOwnership(chapterId: string) {
    return this.dataSource
      .getRepository(Chapter)
      .createQueryBuilder('chapter')
      .innerJoin(Course, 'course', 'course.id = chapter.courseId')
      .select('course.instructorId', 'instructorId')
      .where('chapter.id = :chapterId', { chapterId })
      .getRawOne<OwnershipRow>();
  }

  private findLessonOwnership(lessonId: string) {
    return this.dataSource
      .getRepository(Lesson)
      .createQueryBuilder('lesson')
      .innerJoin(Chapter, 'chapter', 'chapter.id = lesson.chapterId')
      .innerJoin(Course, 'course', 'course.id = chapter.courseId')
      .select('course.instructorId', 'instructorId')
      .where('lesson.id = :lessonId', { lessonId })
      .getRawOne<OwnershipRow>();
  }
}
