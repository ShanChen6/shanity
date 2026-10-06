import { Injectable } from '@nestjs/common';
import type { CourseProgressSummaryDto } from '../dto/course-progress-summary.dto.js';

export const progressCacheKey = (userId: string, courseId: string) =>
  `student:progress:${userId}:${courseId}`;

/**
 * Port for an optional cache of calculated progress. Progress is always
 * computed from lesson_progress + the current published/required lesson set;
 * a cache may only ever hold that result, and must drop:
 * - one student's entry when their progress changes (invalidateStudent),
 * - every entry of a course on CourseCurriculumChanged (invalidateCourse).
 * A Redis adapter (SCAN/UNLINK on `student:progress:*:{courseId}`, or a
 * per-course version key) can replace the default without touching callers.
 */
export abstract class ProgressCache {
  abstract get(
    userId: string,
    courseId: string,
  ): Promise<CourseProgressSummaryDto | null>;
  abstract set(summary: CourseProgressSummaryDto): Promise<void>;
  abstract invalidateStudent(userId: string, courseId: string): Promise<void>;
  abstract invalidateCourse(courseId: string): Promise<void>;
}

/** Default: no caching. Every read is a fresh, exact calculation. */
@Injectable()
export class NoopProgressCache extends ProgressCache {
  get() {
    return Promise.resolve(null);
  }
  set() {
    return Promise.resolve();
  }
  invalidateStudent() {
    return Promise.resolve();
  }
  invalidateCourse() {
    return Promise.resolve();
  }
}
