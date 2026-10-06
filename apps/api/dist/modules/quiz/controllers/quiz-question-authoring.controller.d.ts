import { CreateOptionDto, CreateQuestionDto, ReorderOptionsDto, ReorderQuestionsDto, UpdateOptionDto, UpdateQuestionDto } from '../dto/quiz-question-authoring.dto.js';
import { QuizQuestionAuthoringService } from '../services/quiz-question-authoring.service.js';
export declare class QuizQuestionAuthoringController {
    private readonly authoring;
    constructor(authoring: QuizQuestionAuthoringService);
    createQuestion(quizId: string, body: CreateQuestionDto): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto>;
    reorderQuestions(quizId: string, body: ReorderQuestionsDto): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto[]>;
    updateQuestion(quizId: string, questionId: string, body: UpdateQuestionDto): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto>;
    deleteQuestion(quizId: string, questionId: string): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto[]>;
    createOption(questionId: string, body: CreateOptionDto): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto>;
    reorderOptions(questionId: string, body: ReorderOptionsDto): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto>;
    updateOption(optionId: string, body: UpdateOptionDto): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto>;
    deleteOption(optionId: string): Promise<import("../dto/quiz-question-response.dto.js").InstructorQuestionResponseDto>;
}
