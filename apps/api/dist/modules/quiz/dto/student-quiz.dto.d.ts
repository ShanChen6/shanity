import type { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import { QuizDifficulty, type GradingPolicy, type QuizScope, type ReviewPolicy } from '../entities/quiz.entity.js';
export declare class ListStandaloneQuizzesQueryDto {
    page: number;
    limit: number;
    search?: string;
    difficulty?: QuizDifficulty;
    tag?: string;
}
export declare class ListMyAttemptsQueryDto {
    page: number;
    limit: number;
    scope: 'all' | 'standalone' | 'course';
}
export type StudentQuizRow = {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    scope: QuizScope;
    targetId: string | null;
    isRequired: boolean;
    passingScore: number;
    durationMinutes: number | null;
    maxAttempts: number | null;
    reviewPolicy: ReviewPolicy;
    gradingPolicy: GradingPolicy;
    publishedAt: Date | null;
    difficulty: QuizDifficulty | null;
    tags: string[];
    totalQuestions: number;
    totalPoints: number;
    totalAttempts: number;
};
export type StudentQuizProgressRow = {
    attemptsUsed: number;
    hasActiveAttempt: boolean;
    hasSubmitted: boolean;
    isPassed: boolean;
    latestAttemptId: string | null;
    highestPercentage: number | null;
    latestStatus: QuizAttemptStatus | null;
    latestPassed: boolean | null;
    latestPercentage: number | null;
    latestSubmittedAt: Date | null;
};
export type StudentQuizStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PASSED' | 'FAILED';
export declare class StudentQuizSummaryDto {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    passingScore: number;
    durationMinutes: number | null;
    maxAttempts: number | null;
    totalQuestions: number;
    difficulty: QuizDifficulty | null;
    tags: string[];
    totalAttempts: number;
    publishedAt: Date | null;
}
export declare class StudentQuizDetailDto extends StudentQuizSummaryDto {
    scope: QuizScope;
    isRequired: boolean;
    totalPoints: number;
    reviewPolicy: ReviewPolicy;
    gradingPolicy: GradingPolicy;
    attemptsUsed: number;
    attemptsRemaining: number | null;
    hasActiveAttempt: boolean;
    isPassed: boolean;
    highestPercentage: number | null;
    latestResult: {
        attemptId: string;
        status: QuizAttemptStatus;
        passed: boolean;
        percentage: number;
        submittedAt: Date | null;
    } | null;
}
export declare class StudentCourseQuizDto extends StudentQuizDetailDto {
    targetId: string | null;
    status: StudentQuizStatus;
    latestAttemptId: string | null;
    stepCompleted: boolean;
}
export declare class StudentQuizTransformer {
    static toSummary(row: StudentQuizRow): StudentQuizSummaryDto;
    static toDetail(row: StudentQuizRow, progress: StudentQuizProgressRow): StudentQuizDetailDto;
    static toCourseQuiz(row: StudentQuizRow, progress: StudentQuizProgressRow): StudentCourseQuizDto;
}
export declare class MyAttemptRowDto {
    attemptId: string;
    quizId: string;
    quizTitle: string;
    quizSlug: string | null;
    scope: QuizScope;
    courseId: string | null;
    courseSlug: string | null;
    courseTitle: string | null;
    attemptNumber: number;
    status: QuizAttemptStatus;
    isExpired: boolean;
    startedAt: Date;
    submittedAt: Date | null;
    expiresAt: Date | null;
    durationSeconds: number | null;
    earnedPoints: number | null;
    totalPoints: number | null;
    percentage: number | null;
    isPassed: boolean | null;
    static from(row: MyAttemptRowDto): MyAttemptRowDto;
}
