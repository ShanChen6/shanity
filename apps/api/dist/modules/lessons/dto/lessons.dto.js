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
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf, ValidateNested, } from 'class-validator';
import { LessonType } from '../entities/lesson.entity.js';
const trimString = ({ value }) => typeof value === 'string' ? value.trim() : value;
export class LessonContentDto {
    textBody;
    videoUrl;
    videoAssetId;
    documentAssetId;
    documentFileName;
    documentFileSize;
    documentDownloadAllowed;
}
__decorate([
    IsOptional(),
    IsString(),
    Length(1, 1_000_000),
    __metadata("design:type", String)
], LessonContentDto.prototype, "textBody", void 0);
__decorate([
    IsOptional(),
    IsString(),
    Length(1, 2048),
    __metadata("design:type", String)
], LessonContentDto.prototype, "videoUrl", void 0);
__decorate([
    IsOptional(),
    IsString(),
    Length(1, 255),
    __metadata("design:type", String)
], LessonContentDto.prototype, "videoAssetId", void 0);
__decorate([
    IsOptional(),
    IsString(),
    Length(1, 255),
    __metadata("design:type", String)
], LessonContentDto.prototype, "documentAssetId", void 0);
__decorate([
    IsOptional(),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], LessonContentDto.prototype, "documentFileName", void 0);
__decorate([
    IsOptional(),
    IsInt(),
    Min(0),
    __metadata("design:type", Number)
], LessonContentDto.prototype, "documentFileSize", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], LessonContentDto.prototype, "documentDownloadAllowed", void 0);
export class CreateLessonDto {
    title;
    type;
    isPreview;
    content;
    position;
}
__decorate([
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], CreateLessonDto.prototype, "title", void 0);
__decorate([
    IsEnum(LessonType),
    __metadata("design:type", String)
], CreateLessonDto.prototype, "type", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], CreateLessonDto.prototype, "isPreview", void 0);
__decorate([
    IsObject(),
    ValidateNested(),
    Type(() => LessonContentDto),
    __metadata("design:type", LessonContentDto)
], CreateLessonDto.prototype, "content", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsInt(),
    Min(0),
    Max(2_147_483_647),
    __metadata("design:type", Number)
], CreateLessonDto.prototype, "position", void 0);
export class UpdateLessonDto {
    title;
    type;
    isPreview;
    content;
    position;
}
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], UpdateLessonDto.prototype, "title", void 0);
__decorate([
    IsOptional(),
    IsEnum(LessonType),
    __metadata("design:type", String)
], UpdateLessonDto.prototype, "type", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], UpdateLessonDto.prototype, "isPreview", void 0);
__decorate([
    IsOptional(),
    IsObject(),
    ValidateNested(),
    Type(() => LessonContentDto),
    __metadata("design:type", LessonContentDto)
], UpdateLessonDto.prototype, "content", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsInt(),
    Min(0),
    Max(2_147_483_647),
    __metadata("design:type", Number)
], UpdateLessonDto.prototype, "position", void 0);
//# sourceMappingURL=lessons.dto.js.map