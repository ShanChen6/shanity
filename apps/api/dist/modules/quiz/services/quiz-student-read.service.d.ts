import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { MyAttemptRowDto, type ListMyAttemptsQueryDto, type ListStandaloneQuizzesQueryDto } from '../dto/student-quiz.dto.js';
export declare class QuizStudentReadService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    listStandalone(query: ListStandaloneQuizzesQueryDto): Promise<{
        quizzes: import("../dto/student-quiz.dto.js").StudentQuizSummaryDto[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
        };
    }>;
    standaloneBySlug(principal: Principal, slug: string): Promise<import("../dto/student-quiz.dto.js").StudentQuizDetailDto>;
    listForCourse(principal: Principal, courseId: string): Promise<{
        quizzes: import("../dto/student-quiz.dto.js").StudentCourseQuizDto[];
    }>;
    myAttempts(principal: Principal, query: ListMyAttemptsQueryDto): Promise<{
        attempts: MyAttemptRowDto[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
        };
    }>;
}
