import type { AuthRequest } from '../../auth/auth.guards.js';
import { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { ProgressService } from './progress.service.js';
export declare class ProgressController {
    private readonly progress;
    constructor(progress: ProgressService);
    courseProgress(req: AuthRequest, courseId: string): Promise<{
        courseId: string;
        completedLessonsCount: number;
        totalLessonsCount: number;
        percentage: number;
        lessons: {
            lessonId: string;
            status: import("./entities/lesson-progress.entity.js").LessonProgressStatus;
        }[];
    }>;
    start(req: AuthRequest, id: string): Promise<import("./entities/lesson-progress.entity.js").LessonProgress>;
    complete(req: AuthRequest, id: string, dto: CompleteLessonDto): Promise<import("./entities/lesson-progress.entity.js").LessonProgress>;
    completeAlias(req: AuthRequest, id: string, dto: CompleteLessonDto): Promise<import("./entities/lesson-progress.entity.js").LessonProgress>;
    videoProgress(req: AuthRequest, id: string, dto: VideoProgressDto): Promise<import("./entities/lesson-progress.entity.js").LessonProgress>;
}
