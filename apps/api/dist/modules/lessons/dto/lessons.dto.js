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
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf, ValidateNested, } from 'class-validator';
import { LessonType } from '../entities/lesson.entity.js';
const trimString = ({ value }) => typeof value === 'string' ? value.trim() : value;
export class LessonContentDto {
    textBody;
    videoUrl;
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
    isRequired;
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
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], CreateLessonDto.prototype, "isRequired", void 0);
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
    isRequired;
    isPublished;
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
    IsBoolean(),
    __metadata("design:type", Boolean)
], UpdateLessonDto.prototype, "isRequired", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], UpdateLessonDto.prototype, "isPublished", void 0);
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
export class LessonOrderDto {
    id;
    position;
}
__decorate([
    IsUUID('4'),
    __metadata("design:type", String)
], LessonOrderDto.prototype, "id", void 0);
__decorate([
    IsInt(),
    Min(0),
    Max(2_147_483_647),
    __metadata("design:type", Number)
], LessonOrderDto.prototype, "position", void 0);
export class ReorderLessonsDto {
    lessonOrders;
}
__decorate([
    IsArray(),
    ArrayUnique((lesson) => lesson.id),
    ValidateNested({ each: true }),
    Type(() => LessonOrderDto),
    __metadata("design:type", Array)
], ReorderLessonsDto.prototype, "lessonOrders", void 0);
export class VideoUploadDto {
    title;
    isPreview;
    isRequired;
    durationSeconds;
}
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], VideoUploadDto.prototype, "title", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => value === true || value === 'true'
        ? true
        : value === false || value === 'false'
            ? false
            : value),
    IsBoolean(),
    __metadata("design:type", Boolean)
], VideoUploadDto.prototype, "isPreview", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => value === true || value === 'true'
        ? true
        : value === false || value === 'false'
            ? false
            : value),
    IsBoolean(),
    __metadata("design:type", Boolean)
], VideoUploadDto.prototype, "isRequired", void 0);
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(0),
    Max(2_147_483_647),
    __metadata("design:type", Number)
], VideoUploadDto.prototype, "durationSeconds", void 0);
export class DocumentUploadDto {
    title;
    isPreview;
    isRequired;
    allowDownload;
}
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], DocumentUploadDto.prototype, "title", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => value === true || value === 'true'
        ? true
        : value === false || value === 'false'
            ? false
            : value),
    IsBoolean(),
    __metadata("design:type", Boolean)
], DocumentUploadDto.prototype, "isPreview", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => value === true || value === 'true'
        ? true
        : value === false || value === 'false'
            ? false
            : value),
    IsBoolean(),
    __metadata("design:type", Boolean)
], DocumentUploadDto.prototype, "isRequired", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => value === true || value === 'true'
        ? true
        : value === false || value === 'false'
            ? false
            : value),
    IsBoolean(),
    __metadata("design:type", Boolean)
], DocumentUploadDto.prototype, "allowDownload", void 0);
export class DocumentSettingsDto {
    allowDownload;
}
__decorate([
    IsBoolean(),
    __metadata("design:type", Boolean)
], DocumentSettingsDto.prototype, "allowDownload", void 0);
//# sourceMappingURL=lessons.dto.js.map