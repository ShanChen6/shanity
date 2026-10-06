var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { LearnerQuestionResponseDto } from './quiz-question-response.dto.js';
export class SaveAttemptAnswerDto {
    questionId;
    selectedOptionIds;
}
__decorate([
    IsUUID(),
    __metadata("design:type", String)
], SaveAttemptAnswerDto.prototype, "questionId", void 0);
__decorate([
    IsArray(),
    ArrayMaxSize(50),
    ArrayUnique(),
    IsUUID('all', { each: true }),
    __metadata("design:type", Array)
], SaveAttemptAnswerDto.prototype, "selectedOptionIds", void 0);
export class LearnerAttemptAnswerResponseDto {
    questionId;
    selectedOptionIds;
    savedAt;
    static from(answer) {
        return Object.assign(new LearnerAttemptAnswerResponseDto(), {
            questionId: answer.questionId,
            selectedOptionIds: answer.selectedOptionIds,
            savedAt: answer.savedAt,
        });
    }
}
export class LearnerAttemptResponseDto {
    id;
    quizId;
    attemptNumber;
    status;
    startedAt;
    expiresAt;
    submittedAt;
    score;
    isPassed;
    serverNow;
    quiz;
    answers;
    static from(attempt, answers) {
        const { quiz, questions } = attempt.quizSnapshot;
        return Object.assign(new LearnerAttemptResponseDto(), {
            id: attempt.id,
            quizId: attempt.quizId,
            attemptNumber: attempt.attemptNumber,
            status: attempt.status,
            startedAt: attempt.startedAt,
            expiresAt: attempt.expiresAt,
            submittedAt: attempt.submittedAt,
            score: attempt.score,
            isPassed: attempt.isPassed,
            serverNow: attempt.serverNow,
            ...(answers && {
                quiz: {
                    title: quiz.title,
                    description: quiz.description,
                    durationMinutes: quiz.durationMinutes,
                    passingScore: quiz.passingScore,
                    questions: questions.map((question) => LearnerQuestionResponseDto.from(question)),
                },
                answers: answers.map((answer) => LearnerAttemptAnswerResponseDto.from(answer)),
            }),
        });
    }
}
//# sourceMappingURL=quiz-attempt.dto.js.map