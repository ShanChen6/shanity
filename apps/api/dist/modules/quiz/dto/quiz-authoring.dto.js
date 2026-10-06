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
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, } from 'class-validator';
import { GradingPolicy, QuizScope, QuizStatus, ReviewPolicy, } from '../entities/quiz.entity.js';
const trimString = ({ value }) => typeof value === 'string' ? value.trim() : value;
const present = (_object, value) => value !== undefined;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
class QuizSettingsDto {
    slug;
    description;
    passingScore;
    maxAttempts;
    durationMinutes;
    isRequired;
    reviewPolicy;
    gradingPolicy;
    shuffleQuestions;
    shuffleOptions;
}
__decorate([
    IsOptional(),
    Transform(trimString),
    IsString(),
    MaxLength(255),
    Matches(SLUG, { message: 'slug must be lowercase words joined by hyphens' }),
    __metadata("design:type", Object)
], QuizSettingsDto.prototype, "slug", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], QuizSettingsDto.prototype, "description", void 0);
__decorate([
    ValidateIf(present),
    IsInt(),
    Min(0),
    Max(100),
    __metadata("design:type", Number)
], QuizSettingsDto.prototype, "passingScore", void 0);
__decorate([
    IsOptional(),
    IsInt(),
    Min(1),
    Max(32767),
    __metadata("design:type", Object)
], QuizSettingsDto.prototype, "maxAttempts", void 0);
__decorate([
    IsOptional(),
    IsInt(),
    Min(1),
    Max(2147483647),
    __metadata("design:type", Object)
], QuizSettingsDto.prototype, "durationMinutes", void 0);
__decorate([
    ValidateIf(present),
    IsBoolean(),
    __metadata("design:type", Boolean)
], QuizSettingsDto.prototype, "isRequired", void 0);
__decorate([
    ValidateIf(present),
    IsEnum(ReviewPolicy),
    __metadata("design:type", String)
], QuizSettingsDto.prototype, "reviewPolicy", void 0);
__decorate([
    ValidateIf(present),
    IsEnum(GradingPolicy),
    __metadata("design:type", String)
], QuizSettingsDto.prototype, "gradingPolicy", void 0);
__decorate([
    ValidateIf(present),
    IsBoolean(),
    __metadata("design:type", Boolean)
], QuizSettingsDto.prototype, "shuffleQuestions", void 0);
__decorate([
    ValidateIf(present),
    IsBoolean(),
    __metadata("design:type", Boolean)
], QuizSettingsDto.prototype, "shuffleOptions", void 0);
export class UpdateQuizDto extends QuizSettingsDto {
    title;
}
__decorate([
    ValidateIf(present),
    Transform(trimString),
    IsString(),
    Length(3, 255),
    __metadata("design:type", String)
], UpdateQuizDto.prototype, "title", void 0);
export class CreateQuizDto extends QuizSettingsDto {
    title;
    scope;
    targetId;
}
__decorate([
    Transform(trimString),
    IsString(),
    Length(3, 255),
    __metadata("design:type", String)
], CreateQuizDto.prototype, "title", void 0);
__decorate([
    IsEnum(QuizScope),
    __metadata("design:type", String)
], CreateQuizDto.prototype, "scope", void 0);
__decorate([
    IsOptional(),
    IsUUID(),
    __metadata("design:type", Object)
], CreateQuizDto.prototype, "targetId", void 0);
export class ListQuizzesQueryDto {
    page = 1;
    limit = 20;
    scope;
    status;
    search;
    courseId;
}
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    __metadata("design:type", Number)
], ListQuizzesQueryDto.prototype, "page", void 0);
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(100),
    __metadata("design:type", Number)
], ListQuizzesQueryDto.prototype, "limit", void 0);
__decorate([
    IsOptional(),
    IsEnum(QuizScope),
    __metadata("design:type", String)
], ListQuizzesQueryDto.prototype, "scope", void 0);
__decorate([
    IsOptional(),
    IsEnum(QuizStatus),
    __metadata("design:type", String)
], ListQuizzesQueryDto.prototype, "status", void 0);
__decorate([
    IsOptional(),
    Transform(trimString),
    IsString(),
    MaxLength(255),
    __metadata("design:type", String)
], ListQuizzesQueryDto.prototype, "search", void 0);
__decorate([
    IsOptional(),
    IsUUID(),
    __metadata("design:type", String)
], ListQuizzesQueryDto.prototype, "courseId", void 0);
//# sourceMappingURL=quiz-authoring.dto.js.map