import type { QuizEntity } from '../entities/quiz.entity.js';
import type { QuizQuestionEntity, QuizQuestionType } from '../entities/quiz-question.entity.js';
import type { QuizOptionEntity } from '../entities/quiz-option.entity.js';
export type LearnerOptionSource = Pick<QuizOptionEntity, 'id' | 'content' | 'position'>;
export type LearnerQuestionSource = Pick<QuizQuestionEntity, 'id' | 'type' | 'content' | 'position' | 'points'> & {
    options: LearnerOptionSource[];
};
export declare class LearnerOptionResponseDto {
    id: string;
    content: string;
    position: number;
    static from(option: LearnerOptionSource): LearnerOptionResponseDto;
}
export declare class LearnerQuestionResponseDto {
    id: string;
    type: QuizQuestionType;
    content: string;
    position: number;
    points: number;
    options: LearnerOptionResponseDto[];
    static from(question: LearnerQuestionSource): LearnerQuestionResponseDto;
}
export type LearnerQuizSource = Pick<QuizEntity, 'id' | 'title' | 'description' | 'durationMinutes' | 'passingScore'>;
export declare class LearnerQuizResponseDto {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number | null;
    passingScore: number;
    questions: LearnerQuestionResponseDto[];
    static from(quiz: LearnerQuizSource, questions: LearnerQuestionSource[]): LearnerQuizResponseDto;
}
export declare class InstructorOptionResponseDto {
    id: string;
    content: string;
    position: number;
    isCorrect: boolean;
    createdAt: Date;
    static from(option: QuizOptionEntity): InstructorOptionResponseDto;
}
export declare class InstructorQuestionResponseDto {
    id: string;
    quizId: string;
    type: QuizQuestionType;
    content: string;
    position: number;
    points: number;
    explanation: string | null;
    createdAt: Date;
    updatedAt: Date;
    options: InstructorOptionResponseDto[];
    static from(question: QuizQuestionEntity): InstructorQuestionResponseDto;
}
