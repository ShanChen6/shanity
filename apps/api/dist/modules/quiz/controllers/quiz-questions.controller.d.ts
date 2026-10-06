import { type AuthRequest } from '../../../auth/auth.guards.js';
import { type QuizAuthorizationRequest } from '../guards/quiz-authorization.guard.js';
import { QuizQuestionsService } from '../services/quiz-questions.service.js';
export declare class QuizTakeController {
    private readonly questions;
    constructor(questions: QuizQuestionsService);
    take(req: AuthRequest, id: string): Promise<import("../dto/quiz-question-response.dto.js").LearnerQuizResponseDto>;
}
export declare class AdminQuizQuestionsController {
    private readonly questions;
    constructor(questions: QuizQuestionsService);
    list(req: QuizAuthorizationRequest): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto[]>;
}
