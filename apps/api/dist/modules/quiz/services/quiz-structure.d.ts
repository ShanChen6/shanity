import { QuizQuestionType } from '../entities/quiz-question.entity.js';
export type QuizStructureIssueCode = 'QUIZ_HAS_NO_QUESTIONS' | 'QUESTION_NEEDS_TWO_OPTIONS' | 'QUESTION_MISSING_CORRECT_OPTION' | 'SINGLE_CHOICE_HAS_MULTIPLE_CORRECT' | 'MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION' | 'INVALID_QUESTION_POINTS';
export type QuizStructureIssue = {
    code: QuizStructureIssueCode;
    questionId?: string;
};
export type QuizStructureQuestion = {
    id: string;
    type: QuizQuestionType;
    points: number;
    options: Array<{
        isCorrect: boolean;
    }>;
};
export declare function validateQuizStructure(questions: QuizStructureQuestion[]): {
    valid: boolean;
    issues: QuizStructureIssue[];
};
