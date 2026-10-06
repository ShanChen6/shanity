import { DatabaseService } from '../database/database.module.js';
export type PrerequisiteLesson = {
    id: string;
    title: string;
    slug: string;
};
export type LessonAccessResult = {
    granted: boolean;
    bypass?: boolean;
    reason?: 'LESSON_NOT_FOUND' | 'AUTHENTICATION_REQUIRED' | 'ENROLLMENT_REQUIRED' | 'ENROLLMENT_SUSPENDED' | 'COURSE_UNAVAILABLE' | 'LESSON_UNPUBLISHED' | 'PREREQUISITE_LESSON_NOT_COMPLETED';
    requiredLesson?: PrerequisiteLesson;
};
export declare class CourseAccessService {
    private readonly database;
    constructor(database: DatabaseService);
    canAccessLesson(userId: string | undefined, lessonId: string, options?: {
        allowPreview?: boolean;
    }): Promise<LessonAccessResult>;
}
