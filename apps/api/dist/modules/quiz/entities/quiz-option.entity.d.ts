import type { Relation } from 'typeorm';
import { QuizQuestionEntity } from './quiz-question.entity.js';
export declare class QuizOptionEntity {
    id: string;
    questionId: string;
    question: Relation<QuizQuestionEntity>;
    content: string;
    position: number;
    isCorrect: boolean;
    createdAt: Date;
}
