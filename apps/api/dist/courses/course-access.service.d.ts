import { DatabaseService } from '../database/database.module.js';
export type LessonAccessResult = {
    granted: boolean;
    bypass?: boolean;
    reason?: 'LESSON_NOT_FOUND' | 'AUTHENTICATION_REQUIRED' | 'ENROLLMENT_REQUIRED' | 'COURSE_UNAVAILABLE' | 'LESSON_UNPUBLISHED';
};
export declare class CourseAccessService {
    private readonly database;
    constructor(database: DatabaseService);
    canAccessLesson(userId: string | undefined, lessonId: string, options?: {
        allowPreview?: boolean;
    }): Promise<LessonAccessResult>;
}
