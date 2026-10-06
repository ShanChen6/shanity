import type { CourseProgressSummaryDto } from '../dto/course-progress-summary.dto.js';
export declare const progressCacheKey: (userId: string, courseId: string) => string;
export declare abstract class ProgressCache {
    abstract get(userId: string, courseId: string): Promise<CourseProgressSummaryDto | null>;
    abstract set(summary: CourseProgressSummaryDto): Promise<void>;
    abstract invalidateStudent(userId: string, courseId: string): Promise<void>;
    abstract invalidateCourse(courseId: string): Promise<void>;
}
export declare class NoopProgressCache extends ProgressCache {
    get(): Promise<null>;
    set(): Promise<void>;
    invalidateStudent(): Promise<void>;
    invalidateCourse(): Promise<void>;
}
