import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthRequest } from '../auth/auth.guards.js';
import { Chapter } from './chapter.entity.js';
import { Course } from './course.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
import { CourseStatus } from './course-status.js';

const COURSE_OWNERSHIP = 'courseOwnership';

export interface CourseOwnershipOptions {
  resource?: 'course' | 'chapter' | 'lesson';
  param?: string;
}

export const RequireCourseOwnership = (options: CourseOwnershipOptions = {}) =>
  SetMetadata(COURSE_OWNERSHIP, options);

type CourseRequest = AuthRequest & { course?: Course };

@Injectable()
export class CourseOwnershipGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<CourseOwnershipOptions>(
      COURSE_OWNERSHIP,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<CourseRequest>();
    const body = request.body as { courseId?: unknown } | undefined;
    const resourceId = this.resourceId(request, options, body);
    if (!resourceId) throw new BadRequestException('Course id is required');
    if (!isUUID(resourceId, '4')) throw new BadRequestException('Invalid UUID');

    let courseId = resourceId;
    if (options.resource === 'chapter') {
      const chapter = await this.dataSource.getRepository(Chapter).findOne({
        where: { id: resourceId },
        select: { id: true, courseId: true },
      });
      if (!chapter) throw new NotFoundException('Chapter not found');
      courseId = chapter.courseId;
    }

    if (options.resource === 'lesson') {
      const lesson = await this.dataSource.getRepository(Lesson).findOne({
        where: { id: resourceId },
        select: { id: true, courseId: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      courseId = lesson.courseId;
    }

    const course = await this.dataSource
      .getRepository(Course)
      .findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    request.course = course;

    const principal = request.principal;
    if (principal.roles.includes('admin')) return true;

    if (principal.roles.includes('instructor')) {
      if (course.ownerId === principal.id) return true;
      throw new ForbiddenException();
    }

    if (
      request.method === 'GET' &&
      principal.roles.includes('student') &&
      course.status === CourseStatus.PUBLISHED
    )
      return true;

    throw new ForbiddenException();
  }

  private resourceId(
    request: CourseRequest,
    options: CourseOwnershipOptions,
    body?: { courseId?: unknown },
  ) {
    const params = request.params as Record<string, string | undefined>;
    const candidates =
      options.resource === 'chapter'
        ? [options.param && params[options.param], params.chapterId, params.id]
        : options.resource === 'lesson'
          ? [options.param && params[options.param], params.id]
          : [
              options.param && params[options.param],
              params.id,
              params.courseId,
              body?.courseId,
            ];
    return candidates.find(
      (value): value is string => typeof value === 'string',
    );
  }
}
