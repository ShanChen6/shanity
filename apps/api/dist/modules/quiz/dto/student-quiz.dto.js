var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, } from 'class-validator';
import { QuizDifficulty, } from '../entities/quiz.entity.js';
const trimString = ({ value }) => typeof value === 'string' ? value.trim() : value;
export class ListStandaloneQuizzesQueryDto {
    page = 1;
    limit = 20;
    search;
    difficulty;
    tag;
}
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    __metadata("design:type", Number)
], ListStandaloneQuizzesQueryDto.prototype, "page", void 0);
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(100),
    __metadata("design:type", Number)
], ListStandaloneQuizzesQueryDto.prototype, "limit", void 0);
__decorate([
    IsOptional(),
    Transform(trimString),
    IsString(),
    MaxLength(255),
    __metadata("design:type", String)
], ListStandaloneQuizzesQueryDto.prototype, "search", void 0);
__decorate([
    IsOptional(),
    IsEnum(QuizDifficulty),
    __metadata("design:type", String)
], ListStandaloneQuizzesQueryDto.prototype, "difficulty", void 0);
__decorate([
    IsOptional(),
    Transform(trimString),
    IsString(),
    MaxLength(32),
    __metadata("design:type", String)
], ListStandaloneQuizzesQueryDto.prototype, "tag", void 0);
export class ListMyAttemptsQueryDto {
    page = 1;
    limit = 20;
    scope = 'all';
}
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    __metadata("design:type", Number)
], ListMyAttemptsQueryDto.prototype, "page", void 0);
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(100),
    __metadata("design:type", Number)
], ListMyAttemptsQueryDto.prototype, "limit", void 0);
__decorate([
    IsOptional(),
    IsIn(['all', 'standalone', 'course']),
    __metadata("design:type", String)
], ListMyAttemptsQueryDto.prototype, "scope", void 0);
export class StudentQuizSummaryDto {
    id;
    slug;
    title;
    description;
    passingScore;
    durationMinutes;
    maxAttempts;
    totalQuestions;
    difficulty;
    tags;
    totalAttempts;
    publishedAt;
}
export class StudentQuizDetailDto extends StudentQuizSummaryDto {
    scope;
    isRequired;
    totalPoints;
    reviewPolicy;
    gradingPolicy;
    attemptsUsed;
    attemptsRemaining;
    hasActiveAttempt;
    isPassed;
    highestPercentage;
    latestResult;
}
export class StudentCourseQuizDto extends StudentQuizDetailDto {
    targetId;
    status;
    latestAttemptId;
    stepCompleted;
}
export class StudentQuizTransformer {
    static toSummary(row) {
        return Object.assign(new StudentQuizSummaryDto(), {
            id: row.id,
            slug: row.slug,
            title: row.title,
            description: row.description,
            passingScore: row.passingScore,
            durationMinutes: row.durationMinutes,
            maxAttempts: row.maxAttempts,
            totalQuestions: row.totalQuestions,
            difficulty: row.difficulty,
            tags: row.tags,
            totalAttempts: row.totalAttempts,
            publishedAt: row.publishedAt,
        });
    }
    static toDetail(row, progress) {
        return Object.assign(new StudentQuizDetailDto(), StudentQuizTransformer.toSummary(row), {
            scope: row.scope,
            isRequired: row.isRequired,
            totalPoints: row.totalPoints,
            reviewPolicy: row.reviewPolicy,
            gradingPolicy: row.gradingPolicy,
            attemptsUsed: progress.attemptsUsed,
            attemptsRemaining: row.maxAttempts === null
                ? null
                : Math.max(0, row.maxAttempts - progress.attemptsUsed),
            hasActiveAttempt: progress.hasActiveAttempt,
            isPassed: progress.isPassed,
            highestPercentage: progress.highestPercentage,
            latestResult: progress.latestAttemptId
                ? {
                    attemptId: progress.latestAttemptId,
                    status: progress.latestStatus,
                    passed: progress.latestPassed,
                    percentage: progress.latestPercentage,
                    submittedAt: progress.latestSubmittedAt,
                }
                : null,
        });
    }
    static toCourseQuiz(row, progress) {
        return Object.assign(new StudentCourseQuizDto(), StudentQuizTransformer.toDetail(row, progress), {
            targetId: row.targetId,
            status: progress.isPassed
                ? 'PASSED'
                : progress.hasActiveAttempt
                    ? 'IN_PROGRESS'
                    : progress.hasSubmitted
                        ? 'FAILED'
                        : 'NOT_STARTED',
            latestAttemptId: progress.latestAttemptId,
            stepCompleted: row.isRequired
                ? progress.isPassed
                : progress.hasSubmitted,
        });
    }
}
export class MyAttemptRowDto {
    attemptId;
    quizId;
    quizTitle;
    quizSlug;
    scope;
    courseId;
    courseSlug;
    courseTitle;
    attemptNumber;
    status;
    isExpired;
    startedAt;
    submittedAt;
    expiresAt;
    durationSeconds;
    earnedPoints;
    totalPoints;
    percentage;
    isPassed;
    static from(row) {
        return Object.assign(new MyAttemptRowDto(), {
            attemptId: row.attemptId,
            quizId: row.quizId,
            quizTitle: row.quizTitle,
            quizSlug: row.quizSlug,
            scope: row.scope,
            courseId: row.courseId,
            courseSlug: row.courseSlug,
            courseTitle: row.courseTitle,
            attemptNumber: row.attemptNumber,
            status: row.status,
            isExpired: row.isExpired,
            startedAt: row.startedAt,
            submittedAt: row.submittedAt,
            expiresAt: row.expiresAt,
            durationSeconds: row.durationSeconds,
            earnedPoints: row.earnedPoints,
            totalPoints: row.totalPoints,
            percentage: row.percentage,
            isPassed: row.isPassed,
        });
    }
}
//# sourceMappingURL=student-quiz.dto.js.map