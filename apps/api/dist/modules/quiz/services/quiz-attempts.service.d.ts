import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { LearnerAttemptAnswerResponseDto, LearnerAttemptResponseDto, type SaveAttemptAnswerDto } from '../dto/quiz-attempt.dto.js';
import { type ShuffleFn } from './quiz-attempt-snapshot.js';
import { QuizCourseResolverService } from './quiz-course-resolver.service.js';
import { CourseProgressCalculatorService } from '../../progress/services/course-progress-calculator.service.js';
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';
type Started = {
    created: boolean;
    attempt: LearnerAttemptResponseDto;
};
export declare class QuizAttemptsService {
    private readonly dataSource;
    private readonly access;
    private readonly resolver;
    private readonly progress;
    shuffle: ShuffleFn;
    private readonly closedIn;
    constructor(dataSource: DataSource, access: QuizLearnerAccessService, resolver: QuizCourseResolverService, progress: CourseProgressCalculatorService);
    private transaction;
    start(principal: Principal, quizId: string): Promise<Started>;
    activeAttempt(principal: Principal, quizId: string): Promise<LearnerAttemptResponseDto>;
    saveAnswer(principal: Principal, attemptId: string, answer: SaveAttemptAnswerDto): Promise<LearnerAttemptAnswerResponseDto>;
    submit(principal: Principal, attemptId: string): Promise<LearnerAttemptResponseDto>;
    private assertOwnAttempt;
    private assertAnswerFitsSnapshot;
    private lockActive;
    private lockAttempt;
    private close;
    private view;
    private courseIdOf;
}
export {};
