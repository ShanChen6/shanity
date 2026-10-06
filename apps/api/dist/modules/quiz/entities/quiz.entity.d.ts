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
    ALWAYS = "ALWAYS",
    AFTER_PASS = "AFTER_PASS",
    AFTER_EXHAUSTED = "AFTER_EXHAUSTED",
    NEVER = "NEVER"
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
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    version: number;
    createdBy: string;
    creator: Relation<User>;
    createdAt: Date;
    updatedAt: Date;
}
