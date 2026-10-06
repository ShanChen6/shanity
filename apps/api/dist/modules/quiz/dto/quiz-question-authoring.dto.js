var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested, } from 'class-validator';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
const present = (_object, value) => value !== undefined;
export const MAX_OPTIONS_PER_QUESTION = 50;
export const MAX_REORDER_ITEMS = 1000;
export class CreateOptionDto {
    content;
    isCorrect;
}
__decorate([
    IsString(),
    MaxLength(2000),
    __metadata("design:type", String)
], CreateOptionDto.prototype, "content", void 0);
__decorate([
    ValidateIf(present),
    IsBoolean(),
    __metadata("design:type", Boolean)
], CreateOptionDto.prototype, "isCorrect", void 0);
export class UpdateOptionDto {
    content;
    isCorrect;
}
__decorate([
    ValidateIf(present),
    IsString(),
    MaxLength(2000),
    __metadata("design:type", String)
], UpdateOptionDto.prototype, "content", void 0);
__decorate([
    ValidateIf(present),
    IsBoolean(),
    __metadata("design:type", Boolean)
], UpdateOptionDto.prototype, "isCorrect", void 0);
export class UpdateQuestionDto {
    content;
    type;
    points;
    explanation;
}
__decorate([
    ValidateIf(present),
    IsString(),
    MaxLength(20000),
    __metadata("design:type", String)
], UpdateQuestionDto.prototype, "content", void 0);
__decorate([
    ValidateIf(present),
    IsEnum(QuizQuestionType),
    __metadata("design:type", String)
], UpdateQuestionDto.prototype, "type", void 0);
__decorate([
    ValidateIf(present),
    IsInt(),
    Min(1),
    Max(32767),
    __metadata("design:type", Number)
], UpdateQuestionDto.prototype, "points", void 0);
__decorate([
    IsOptional(),
    IsString(),
    MaxLength(20000),
    __metadata("design:type", Object)
], UpdateQuestionDto.prototype, "explanation", void 0);
export class CreateQuestionDto {
    content;
    type;
    points;
    explanation;
    options;
}
__decorate([
    IsString(),
    MaxLength(20000),
    __metadata("design:type", String)
], CreateQuestionDto.prototype, "content", void 0);
__decorate([
    ValidateIf(present),
    IsEnum(QuizQuestionType),
    __metadata("design:type", String)
], CreateQuestionDto.prototype, "type", void 0);
__decorate([
    ValidateIf(present),
    IsInt(),
    Min(1),
    Max(32767),
    __metadata("design:type", Number)
], CreateQuestionDto.prototype, "points", void 0);
__decorate([
    IsOptional(),
    IsString(),
    MaxLength(20000),
    __metadata("design:type", Object)
], CreateQuestionDto.prototype, "explanation", void 0);
__decorate([
    ValidateIf(present),
    IsArray(),
    ArrayMaxSize(MAX_OPTIONS_PER_QUESTION),
    ValidateNested({ each: true }),
    Type(() => CreateOptionDto),
    __metadata("design:type", Array)
], CreateQuestionDto.prototype, "options", void 0);
export class ReorderItemDto {
    id;
    position;
}
__decorate([
    IsUUID(),
    __metadata("design:type", String)
], ReorderItemDto.prototype, "id", void 0);
__decorate([
    IsInt(),
    Min(1),
    Max(32767),
    __metadata("design:type", Number)
], ReorderItemDto.prototype, "position", void 0);
export class ReorderDto {
    items;
}
__decorate([
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(MAX_REORDER_ITEMS),
    ValidateNested({ each: true }),
    Type(() => ReorderItemDto),
    __metadata("design:type", Array)
], ReorderDto.prototype, "items", void 0);
export class ReorderQuestionsDto extends ReorderDto {
}
export class ReorderOptionsDto extends ReorderDto {
}
//# sourceMappingURL=quiz-question-authoring.dto.js.map