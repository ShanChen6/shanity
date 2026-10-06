import { type AuthRequest } from '../../auth/auth.guards.js';
import { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { UpdateProgressDto } from './dto/update-progress.dto.js';
import { ProgressService } from './progress.service.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { ResumeLearningService } from './services/resume-learning.service.js';
import type { EnrolledCourseDto } from './dto/enrolled-course.dto.js';
export declare class ProgressController {
    private readonly progress;
    private readonly progressCalculator;
    private readonly resumeLearning;
    constructor(progress: ProgressService, progressCalculator: CourseProgressCalculatorService, resumeLearning: ResumeLearningService);
    resumeCourse(req: AuthRequest): Promise<{
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
    resumeLesson(req: AuthRequest, courseId: string): Promise<{
        lessonSlug: string | null;
        lessonTitle: string | null;
        lastPosition: number;
        hasStarted: boolean;
    }>;
    enrolledCourses(req: AuthRequest): Promise<EnrolledCourseDto[]>;
    course(req: AuthRequest, courseId: string): Promise<import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto & {
        lessons: {
            lessonId: string;
            status: import("./entities/lesson-progress.entity.js").LessonProgressStatus | "NOT_STARTED";
            isRequired: boolean;
            lastPosition: number | null;
        }[];
    }>;
    start(req: AuthRequest, lessonId: string): Promise<{
        progress: import("./entities/lesson-progress.entity.js").LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    heartbeat(req: AuthRequest, lessonId: string, dto: UpdateProgressDto): Promise<{
        progress: import("./entities/lesson-progress.entity.js").LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    complete(req: AuthRequest, lessonId: string, dto: CompleteLessonDto): Promise<{
        progress: import("./entities/lesson-progress.entity.js").LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
    video(req: AuthRequest, id: string, dto: VideoProgressDto): Promise<{
        progress: import("./entities/lesson-progress.entity.js").LessonProgress;
        courseProgress: import("./dto/course-progress-summary.dto.js").CourseProgressSummaryDto;
    }>;
}
