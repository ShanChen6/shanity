import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { InstructorQuestionResponseDto, LearnerQuizResponseDto } from '../dto/quiz-question-response.dto.js';
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';
export declare class QuizQuestionsService {
    private readonly dataSource;
    private readonly access;
    constructor(dataSource: DataSource, access: QuizLearnerAccessService);
    listForInstructor(quizId: string): Promise<InstructorQuestionResponseDto[]>;
    getForLearner(principal: Principal, quizId: string): Promise<LearnerQuizResponseDto>;
}
