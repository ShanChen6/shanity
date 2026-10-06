import { type AuthRequest } from '../../../auth/auth.guards.js';
import { CreateQuizDto, ListQuizzesQueryDto, UpdateQuizDto } from '../dto/quiz-authoring.dto.js';
import { type QuizAuthorizationRequest } from '../guards/quiz-authorization.guard.js';
import { QuizAuthoringService } from '../services/quiz-authoring.service.js';
import { QuizPublishingService } from '../services/quiz-publishing.service.js';
export declare class QuizAuthoringController {
    private readonly authoring;
    private readonly publishing;
    constructor(authoring: QuizAuthoringService, publishing: QuizPublishingService);
    create(req: AuthRequest, body: CreateQuizDto): Promise<{
        courseId: string | null;
        author: {
            id: string;
            displayName: string;
        } | null;
        attemptCount: number;
        questions: import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto[];
        id: string;
        title: string;
        slug: string | null;
        description: string | null;
        scope: import("../entities/quiz.entity.js").QuizScope;
        targetId: string | null;
        status: import("../entities/quiz.entity.js").QuizStatus;
        version: number;
        passingScore: number;
        maxAttempts: number | null;
        durationMinutes: number | null;
        isRequired: boolean;
        reviewPolicy: import("../entities/quiz.entity.js").ReviewPolicy;
        gradingPolicy: import("../entities/quiz.entity.js").GradingPolicy;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        createdBy: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    list(req: AuthRequest, query: ListQuizzesQueryDto): Promise<{
        quizzes: {
            id: string;
            title: string;
            slug: string | null;
            scope: import("../entities/quiz.entity.js").QuizScope;
            targetId: string | null;
            courseId: string | null;
            status: import("../entities/quiz.entity.js").QuizStatus;
            version: number;
            isRequired: boolean;
            questionCount: number;
            createdBy: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
        };
    }>;
    detail(req: QuizAuthorizationRequest): Promise<{
        courseId: string | null;
        author: {
            id: string;
            displayName: string;
        } | null;
        attemptCount: number;
        questions: import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto[];
        id: string;
        title: string;
        slug: string | null;
        description: string | null;
        scope: import("../entities/quiz.entity.js").QuizScope;
        targetId: string | null;
        status: import("../entities/quiz.entity.js").QuizStatus;
        version: number;
        passingScore: number;
        maxAttempts: number | null;
        durationMinutes: number | null;
        isRequired: boolean;
        reviewPolicy: import("../entities/quiz.entity.js").ReviewPolicy;
        gradingPolicy: import("../entities/quiz.entity.js").GradingPolicy;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        createdBy: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(req: QuizAuthorizationRequest, body: UpdateQuizDto): Promise<{
        courseId: string | null;
        author: {
            id: string;
            displayName: string;
        } | null;
        attemptCount: number;
        questions: import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto[];
        id: string;
        title: string;
        slug: string | null;
        description: string | null;
        scope: import("../entities/quiz.entity.js").QuizScope;
        targetId: string | null;
        status: import("../entities/quiz.entity.js").QuizStatus;
        version: number;
        passingScore: number;
        maxAttempts: number | null;
        durationMinutes: number | null;
        isRequired: boolean;
        reviewPolicy: import("../entities/quiz.entity.js").ReviewPolicy;
        gradingPolicy: import("../entities/quiz.entity.js").GradingPolicy;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        createdBy: string;
        publishedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    publish(req: QuizAuthorizationRequest): Promise<{
        id: string;
        title: string;
        version: number;
        status: import("../entities/quiz.entity.js").QuizStatus;
        publishedAt: Date | null;
    }>;
    remove(req: QuizAuthorizationRequest): Promise<{
        id: string;
        outcome: "DELETED";
        status: null;
    } | {
        id: string;
        outcome: "ARCHIVED";
        status: import("../entities/quiz.entity.js").QuizStatus;
    }>;
}
