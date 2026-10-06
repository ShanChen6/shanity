import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';

const UNTRUSTED_OWNERSHIP_FIELDS = [
  'courseId',
  'instructorId',
  'authorId',
] as const;

@Injectable()
export class LessonRequestSanitizationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.body && typeof request.body === 'object') {
      const body = request.body as Record<string, unknown>;
      for (const field of UNTRUSTED_OWNERSHIP_FIELDS) delete body[field];
    }
    return next.handle();
  }
}
