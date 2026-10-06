import { QuizQuestionType } from '../entities/quiz-question.entity.js';
export declare const MAX_OPTIONS_PER_QUESTION = 50;
export declare const MAX_REORDER_ITEMS = 1000;
export declare class CreateOptionDto {
    content: string;
    isCorrect?: boolean;
}
export declare class UpdateOptionDto {
    content?: string;
    isCorrect?: boolean;
}
export declare class UpdateQuestionDto {
    content?: string;
    type?: QuizQuestionType;
    points?: number;
    explanation?: string | null;
}
export declare class CreateQuestionDto {
    content: string;
    type?: QuizQuestionType;
    points?: number;
    explanation?: string | null;
    options?: CreateOptionDto[];
}
export declare class ReorderItemDto {
    id: string;
    position: number;
}
export declare class ReorderDto {
    items: ReorderItemDto[];
}
export declare class ReorderQuestionsDto extends ReorderDto {
}
export declare class ReorderOptionsDto extends ReorderDto {
}
