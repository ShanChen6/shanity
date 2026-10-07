import { DataSource } from 'typeorm';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { QuizStatus } from '../entities/quiz.entity.js';
import { QuizPublishValidationPipeline } from './quiz-publish-validation.pipeline.js';
export declare class QuizPublishingService {
    private readonly dataSource;
    private readonly pipeline;
    private readonly curriculum;
    constructor(dataSource: DataSource, pipeline: QuizPublishValidationPipeline, curriculum: CurriculumEvents);
    publish(quizId: string, courseId: string | null): Promise<{
        id: string;
        title: string;
        version: number;
        status: QuizStatus;
        publishedAt: Date | null;
    }>;
    openNewVersion(quizId: string, courseId: string | null): Promise<{
        id: string;
        title: string;
        version: number;
        status: QuizStatus;
        publishedAt: Date | null;
    }>;
}
