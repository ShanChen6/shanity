import { DatabaseService } from '../database/database.module.js';
export type LessonAccessResult = {
    granted: boolean;
    reason?: 'LESSON_NOT_FOUND' | 'AUTHENTICATION_REQUIRED' | 'ENROLLMENT_REQUIRED';
};
export declare class CourseAccessService {
    private readonly database;
    constructor(database: DatabaseService);
    canAccessLesson(userId: string | undefined, lessonId: string): Promise<LessonAccessResult>;
}
