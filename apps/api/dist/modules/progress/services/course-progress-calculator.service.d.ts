import { type OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { ProgressCache } from '../cache/progress-cache.js';
import { CourseProgressSummaryDto } from '../dto/course-progress-summary.dto.js';
import type { EnrolledCourseDto } from '../dto/enrolled-course.dto.js';
export declare const progressPercentage: (completed: number, total: number) => number;
export declare class CourseProgressCalculatorService implements OnModuleInit {
    private readonly database;
    private readonly cache;
    private readonly curriculum;
    constructor(database: DatabaseService, cache: ProgressCache, curriculum: CurriculumEvents);
    onModuleInit(): void;
    invalidateCourseProgressCache(courseId: string): Promise<void>;
    invalidateStudentProgress(userId: string, courseId: string): Promise<void>;
    calculateLearningProgressPercentage(userId: string, courseId: string): Promise<number>;
    evaluateCourseCompletion(userId: string, courseId: string): Promise<boolean>;
    calculate(userId: string, courseId: string): Promise<CourseProgressSummaryDto>;
    private compute;
    enrolledCourses(userId: string): Promise<EnrolledCourseDto[]>;
    private summarySelect;
    private toSummary;
}
