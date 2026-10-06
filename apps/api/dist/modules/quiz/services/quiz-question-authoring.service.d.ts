import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { InstructorQuestionResponseDto } from '../dto/quiz-question-response.dto.js';
import { type CreateOptionDto, type CreateQuestionDto, type ReorderDto, type UpdateOptionDto, type UpdateQuestionDto } from '../dto/quiz-question-authoring.dto.js';
import { QuizQuestionsService } from './quiz-questions.service.js';
export declare const MAX_QUESTIONS_PER_QUIZ = 1000;
export declare class QuizQuestionAuthoringService {
    private readonly dataSource;
    private readonly questions;
    constructor(dataSource: DataSource, questions: QuizQuestionsService);
    createQuestion(quizId: string, dto: CreateQuestionDto): Promise<InstructorQuestionResponseDto>;
    updateQuestion(quizId: string, questionId: string, dto: UpdateQuestionDto): Promise<InstructorQuestionResponseDto>;
    deleteQuestion(quizId: string, questionId: string): Promise<InstructorQuestionResponseDto[]>;
    reorderQuestions(quizId: string, dto: ReorderDto): Promise<InstructorQuestionResponseDto[]>;
    createOption(questionId: string, dto: CreateOptionDto): Promise<InstructorQuestionResponseDto>;
    updateOption(optionId: string, dto: UpdateOptionDto): Promise<InstructorQuestionResponseDto>;
    deleteOption(optionId: string): Promise<InstructorQuestionResponseDto>;
    reorderOptions(questionId: string, dto: ReorderDto): Promise<InstructorQuestionResponseDto>;
    validateQuizStructureForPublish(quizId: string, manager?: EntityManager): Promise<{
        valid: boolean;
        issues: import("./quiz-structure.js").QuizStructureIssue[];
    }>;
    private lockQuiz;
    private lockQuestionOf;
    private question;
}
