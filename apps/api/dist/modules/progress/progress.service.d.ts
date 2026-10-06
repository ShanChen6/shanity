import { DataSource } from 'typeorm';
import { LessonProgress, LessonProgressStatus } from './entities/lesson-progress.entity.js';
import type { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
export declare class ProgressService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    private context;
    private getOrCreate;
    start(userId: string, lessonId: string): Promise<LessonProgress>;
    complete(userId: string, lessonId: string, dto: CompleteLessonDto): Promise<LessonProgress>;
    videoProgress(userId: string, lessonId: string, dto: VideoProgressDto): Promise<LessonProgress>;
    courseProgress(userId: string, courseId: string): Promise<{
        courseId: string;
        completedLessonsCount: number;
        totalLessonsCount: number;
        percentage: number;
        lessons: {
            lessonId: string;
            status: LessonProgressStatus;
        }[];
    }>;
}
