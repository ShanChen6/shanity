import { DatabaseService } from '../../database/database.module.js';
import { LessonProgress, LessonProgressStatus } from './entities/lesson-progress.entity.js';
import type { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import type { UpdateProgressDto } from './dto/update-progress.dto.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { EnrollmentPolicy } from './services/enrollment-policy.js';
export declare class ProgressService {
    private readonly database;
    private readonly progressCalculator;
    private readonly enrollments;
    constructor(database: DatabaseService, progressCalculator: CourseProgressCalculatorService, enrollments: EnrollmentPolicy);
    private lessonForStudent;
    start(userId: string, lessonId: string): Promise<LessonProgress>;
    startLesson(userId: string, lessonId: string): Promise<{
        progress: LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    updateHeartbeat(userId: string, lessonId: string, dto: UpdateProgressDto): Promise<{
        progress: LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    complete(userId: string, lessonId: string, evidence: CompleteLessonDto): Promise<LessonProgress>;
    completeLesson(userId: string, lessonId: string, evidence: CompleteLessonDto): Promise<{
        progress: LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    videoProgress(userId: string, lessonId: string, dto: VideoProgressDto): Promise<{
        progress: LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    courseProgress(userId: string, courseId: string): Promise<import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto & {
        lessons: {
            lessonId: string;
            status: LessonProgressStatus | "NOT_STARTED";
            isRequired: boolean;
            lastPosition: number | null;
        }[];
    }>;
    calculateCourseProgress(userId: string, courseId: string): Promise<import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto>;
    private markCompleted;
    private find;
}
