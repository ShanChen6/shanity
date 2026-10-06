import { DatabaseService } from '../../../database/database.module.js';
import { CourseProgressCalculatorService } from './course-progress-calculator.service.js';
import { EnrollmentPolicy } from './enrollment-policy.js';
export declare class ResumeLearningService {
    private readonly database;
    private readonly progressCalculator;
    private readonly enrollments;
    constructor(database: DatabaseService, progressCalculator: CourseProgressCalculatorService, enrollments: EnrollmentPolicy);
    course(userId: string, courseId: string): Promise<{
        lessonSlug: string | null;
        lessonTitle: string | null;
        lastPosition: number;
        hasStarted: boolean;
    }>;
    latest(userId: string): Promise<{
        hasActiveCourse: boolean;
        course?: undefined;
        resumeLesson?: undefined;
        progressPercentage?: undefined;
    } | {
        hasActiveCourse: boolean;
        course: {
            id: string;
            title: string;
            slug: string;
        };
        resumeLesson: {
            id: string;
            title: string | null;
            slug: string | null;
            lastPosition: number;
        };
        progressPercentage: number;
    }>;
    private resolve;
}
