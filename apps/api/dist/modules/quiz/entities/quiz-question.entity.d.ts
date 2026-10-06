import type { Relation } from 'typeorm';
import { QuizEntity } from './quiz.entity.js';
import { QuizOptionEntity } from './quiz-option.entity.js';
export declare enum QuizQuestionType {
    SINGLE_CHOICE = "SINGLE_CHOICE",
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
}
export declare class QuizQuestionEntity {
    id: string;
    quizId: string;
    quiz: Relation<QuizEntity>;
    type: QuizQuestionType;
    content: string;
    position: number;
    points: number;
    explanation: string | null;
    options: Relation<QuizOptionEntity[]>;
    createdAt: Date;
    updatedAt: Date;
}
