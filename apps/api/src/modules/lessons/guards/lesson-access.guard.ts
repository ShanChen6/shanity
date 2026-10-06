import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthConfig } from '../../../auth/auth.config.js';
import { cookie } from '../../../auth/auth.guards.js';
import { AuthService } from '../../../auth/auth.service.js';
import type { Principal } from '../../../auth/auth.service.js';
import {
  CourseAccessService,
  type LessonAccessResult,
} from '../../../courses/course-access.service.js';

export type LessonAccessContext = {
  principal?: Principal;
  bypass: boolean;
};
export type LessonAccessRequest = Request & {
  lessonAccess?: LessonAccessContext;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function rejectLessonAccess(result: LessonAccessResult): never {
  switch (result.reason) {
    case 'LESSON_NOT_FOUND':
      throw new NotFoundException('Lesson not found');
    case 'AUTHENTICATION_REQUIRED':
      throw new ForbiddenException({
        statusCode: 403,
        message: 'ENROLLMENT_REQUIRED',
        code: 'ENROLLMENT_REQUIRED',
      });
    case 'ENROLLMENT_REQUIRED':
      throw new ForbiddenException({
        statusCode: 403,
        message: 'ENROLLMENT_REQUIRED',
        code: 'ENROLLMENT_REQUIRED',
      });
    case 'ENROLLMENT_SUSPENDED':
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Enrollment Suspended',
        code: 'ENROLLMENT_SUSPENDED',
      });
    case 'PREREQUISITE_LESSON_NOT_COMPLETED':
      throw new ForbiddenException({
        statusCode: 403,
        message: 'PREREQUISITE_LESSON_NOT_COMPLETED',
        code: 'PREREQUISITE_LESSON_NOT_COMPLETED',
        requiredLesson: result.requiredLesson,
      });
    default:
      throw new ForbiddenException({
        statusCode: 403,
        message: 'LESSON_NOT_AVAILABLE',
        code: 'LESSON_NOT_AVAILABLE',
      });
  }
}

/** Central server-side gate for every client-facing lesson read/media route. */
@Injectable()
export class LessonAccessGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
    private readonly policy: CourseAccessService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<LessonAccessRequest>();
    const params = request.params as Record<string, string | undefined>;
    const lessonId = params.id ?? params.lessonId;
    if (!lessonId || !UUID.test(lessonId))
      throw new NotFoundException('Lesson not found');

    const token = cookie(request, this.config.cookieName('access'));
    const principal = token ? await this.auth.authenticate(token) : undefined;
    const access = await this.policy.canAccessLesson(principal?.id, lessonId);
    if (!access.granted) rejectLessonAccess(access);

    request.lessonAccess = { principal, bypass: access.bypass === true };
    return true;
  }
}
