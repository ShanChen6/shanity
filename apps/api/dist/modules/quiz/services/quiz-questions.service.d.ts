import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseAccessService } from '../../../courses/course-access.service.js';
import { InstructorQuestionResponseDto, LearnerQuizResponseDto } from '../dto/quiz-question-response.dto.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import { QuizCourseResolverService } from './quiz-course-resolver.service.js';
export declare class QuizQuestionsService {
    private readonly dataSource;
    private readonly resolver;
    private readonly authorization;
    private readonly courseAccess;
    constructor(dataSource: DataSource, resolver: QuizCourseResolverService, authorization: QuizAuthorizationGuard, courseAccess: CourseAccessService);
    listForInstructor(quizId: string): Promise<InstructorQuestionResponseDto[]>;
    getForLearner(principal: Principal, quizId: string): Promise<LearnerQuizResponseDto>;
    private assertCanTake;
}
