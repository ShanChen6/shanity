var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, Injectable } from '@nestjs/common';
import { QuizScope } from '../entities/quiz.entity.js';
import { QuizCourseResolverService } from './quiz-course-resolver.service.js';
export const QuizTargetErrorCode = {
    INVALID_QUIZ_SCOPE: 'INVALID_QUIZ_SCOPE',
    INVALID_TARGET_LESSON: 'INVALID_TARGET_LESSON',
    INVALID_TARGET_CHAPTER: 'INVALID_TARGET_CHAPTER',
    INVALID_TARGET_COURSE: 'INVALID_TARGET_COURSE',
    STANDALONE_QUIZ_CANNOT_HAVE_TARGET: 'STANDALONE_QUIZ_CANNOT_HAVE_TARGET',
    INVALID_QUIZ_TARGET: 'INVALID_QUIZ_TARGET',
};
const INVALID_TARGET = {
    [QuizScope.LESSON]: QuizTargetErrorCode.INVALID_TARGET_LESSON,
    [QuizScope.CHAPTER]: QuizTargetErrorCode.INVALID_TARGET_CHAPTER,
    [QuizScope.COURSE]: QuizTargetErrorCode.INVALID_TARGET_COURSE,
};
function reject(code) {
    throw new BadRequestException({ statusCode: 400, message: code, code });
}
const isQuizScope = (value) => Object.values(QuizScope).includes(value);
let QuizTargetValidationService = class QuizTargetValidationService {
    resolver;
    constructor(resolver) {
        this.resolver = resolver;
    }
    async validate(scope, targetId, manager) {
        if (!isQuizScope(scope))
            reject(QuizTargetErrorCode.INVALID_QUIZ_SCOPE);
        if (scope === QuizScope.STANDALONE) {
            if (targetId !== null && targetId !== undefined)
                reject(QuizTargetErrorCode.STANDALONE_QUIZ_CANNOT_HAVE_TARGET);
            return { scope, targetId: null, courseId: null };
        }
        const code = INVALID_TARGET[scope];
        if (typeof targetId !== 'string')
            reject(code);
        const courseId = await this.resolver.findTargetCourseId({ scope, targetId }, manager);
        if (!courseId)
            reject(code);
        return { scope, targetId, courseId };
    }
};
QuizTargetValidationService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [QuizCourseResolverService])
], QuizTargetValidationService);
export { QuizTargetValidationService };
export function rethrowQuizTargetViolation(error) {
    const { code, constraint } = (error ?? {});
    if ((code === '23514' && constraint === 'CHK_quizzes_scope_target_integrity') ||
        (code === '23503' && constraint === 'FK_quizzes_target'))
        reject(QuizTargetErrorCode.INVALID_QUIZ_TARGET);
    throw error;
}
//# sourceMappingURL=quiz-target-validation.service.js.map