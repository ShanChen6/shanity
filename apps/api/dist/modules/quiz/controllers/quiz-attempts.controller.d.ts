import type { Response } from 'express';
import { type AuthRequest } from '../../../auth/auth.guards.js';
import { SaveAttemptAnswerDto } from '../dto/quiz-attempt.dto.js';
import { QuizAttemptsService } from '../services/quiz-attempts.service.js';
export declare class QuizAttemptsController {
    private readonly attempts;
    constructor(attempts: QuizAttemptsService);
    start(req: AuthRequest, id: string, res: Response): Promise<import("../dto/quiz-attempt.dto.js").LearnerAttemptResponseDto>;
    active(req: AuthRequest, id: string): Promise<import("../dto/quiz-attempt.dto.js").LearnerAttemptResponseDto>;
    saveAnswer(req: AuthRequest, attemptId: string, body: SaveAttemptAnswerDto): Promise<import("../dto/quiz-attempt.dto.js").LearnerAttemptAnswerResponseDto>;
    result(req: AuthRequest, attemptId: string): Promise<import("../dto/quiz-attempt-result.dto.js").AttemptResultDto>;
    submit(req: AuthRequest, attemptId: string): Promise<import("../dto/quiz-attempt.dto.js").LearnerAttemptResponseDto>;
}
