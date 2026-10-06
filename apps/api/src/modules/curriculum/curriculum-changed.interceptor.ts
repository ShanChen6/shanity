import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, mergeMap, tap } from 'rxjs';
import { DatabaseService } from '../../database/database.module.js';
import { CurriculumEvents } from './curriculum-events.js';

/**
 * Single choke point for CourseCurriculumChanged: put on every controller that
 * edits course structure, so no individual handler can forget to emit.
 * The course id is resolved *before* the handler runs (a deleted lesson can no
 * longer be looked up) and the event fires only after the handler succeeds.
 */
@Injectable()
export class CurriculumChangedInterceptor implements NestInterceptor {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: CurriculumEvents,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'GET') return next.handle();
    return from(this.courseIdFor(request)).pipe(
      mergeMap((courseId) =>
        next.handle().pipe(
          tap(() => {
            if (courseId)
              this.events.emitChanged({
                courseId,
                source: `${request.method} ${routePath(request)}`,
              });
          }),
        ),
      ),
    );
  }

  private async courseIdFor(request: Request): Promise<string | null> {
    const params = request.params as Record<string, string | undefined>;
    const path = routePath(request);
    const lookup = async (table: 'chapters' | 'lessons', id?: string) => {
      if (!id) return null;
      const [row] = await this.database.dataSource
        .query<Array<{ courseId: string }>>(
          `SELECT course_id AS "courseId" FROM ${table} WHERE id = $1`,
          [id],
        )
        .catch(() => []);
      return row?.courseId ?? null;
    };
    if (params.courseId) return params.courseId;
    if (params.chapterId) return lookup('chapters', params.chapterId);
    if (/\/lessons\/:id(\/|$)/.test(path)) return lookup('lessons', params.id);
    if (/\/chapters\/:id(\/|$)/.test(path))
      return lookup('chapters', params.id);
    if (/\/courses\/:id(\/|$)/.test(path)) return params.id ?? null;
    return null;
  }
}

const routePath = (request: Request) =>
  String(
    (request.route as { path?: string } | undefined)?.path ?? request.path,
  );
