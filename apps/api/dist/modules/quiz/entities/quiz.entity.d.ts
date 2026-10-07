import type { Relation } from 'typeorm';
import { User } from '../../../users/user.entity.js';
export declare enum QuizScope {
    LESSON = "LESSON",
    CHAPTER = "CHAPTER",
    COURSE = "COURSE",
    STANDALONE = "STANDALONE"
}
export declare enum QuizStatus {
    DRAFT = "DRAFT",
    PUBLISHED = "PUBLISHED",
    ARCHIVED = "ARCHIVED"
}
export declare enum ReviewPolicy {
    AFTER_SUBMIT = "AFTER_SUBMIT",
    AFTER_PASS = "AFTER_PASS",
    AFTER_EXHAUSTED = "AFTER_EXHAUSTED",
    NEVER = "NEVER"
}
export declare enum QuizDifficulty {
    BEGINNER = "BEGINNER",
    INTERMEDIATE = "INTERMEDIATE",
    ADVANCED = "ADVANCED"
}
export declare enum GradingPolicy {
    HIGHEST = "HIGHEST",
    LATEST = "LATEST"
}
export declare class QuizEntity {
    id: string;
    title: string;
    slug: string | null;
    description: string | null;
    scope: QuizScope;
    targetId: string | null;
    status: QuizStatus;
    passingScore: number;
    maxAttempts: number | null;
    durationMinutes: number | null;
    isRequired: boolean;
    reviewPolicy: ReviewPolicy;
    gradingPolicy: GradingPolicy;
    difficulty: QuizDifficulty | null;
    tags: string[];
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    version: number;
    createdBy: string;
    creator: Relation<User>;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
