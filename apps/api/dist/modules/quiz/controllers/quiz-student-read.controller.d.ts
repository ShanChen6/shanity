import { type AuthRequest } from '../../../auth/auth.guards.js';
import { ListMyAttemptsQueryDto, ListStandaloneQuizzesQueryDto } from '../dto/student-quiz.dto.js';
import { QuizStudentReadService } from '../services/quiz-student-read.service.js';
export declare class QuizStudentReadController {
    private readonly reads;
    constructor(reads: QuizStudentReadService);
    listStandalone(query: ListStandaloneQuizzesQueryDto): Promise<{
        quizzes: import("../dto/student-quiz.dto.js").StudentQuizSummaryDto[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
        };
    }>;
    standalone(req: AuthRequest, slug: string): Promise<import("../dto/student-quiz.dto.js").StudentQuizDetailDto>;
    listForCourse(req: AuthRequest, courseId: string): Promise<{
        quizzes: import("../dto/student-quiz.dto.js").StudentCourseQuizDto[];
    }>;
    myAttempts(req: AuthRequest, query: ListMyAttemptsQueryDto): Promise<{
        attempts: import("../dto/student-quiz.dto.js").MyAttemptRowDto[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
        };
    }>;
}
