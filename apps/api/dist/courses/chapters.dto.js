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
import { ArrayUnique, IsArray, IsInt, IsOptional, IsUUID, IsString, Length, Matches, Max, Min, ValidateNested, ValidateIf, } from 'class-validator';
const trimString = ({ value }) => typeof value === 'string' ? value.trim() : value;
export class CreateChapterDto {
    title;
    description;
    position;
}
__decorate([
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], CreateChapterDto.prototype, "title", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], CreateChapterDto.prototype, "description", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsInt(),
    Min(0),
    __metadata("design:type", Number)
], CreateChapterDto.prototype, "position", void 0);
export class UpdateChapterDto {
    title;
    description;
    position;
}
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], UpdateChapterDto.prototype, "title", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], UpdateChapterDto.prototype, "description", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsInt(),
    Min(0),
    __metadata("design:type", Number)
], UpdateChapterDto.prototype, "position", void 0);
export class ChapterOrderDto {
    id;
    position;
}
__decorate([
    IsUUID('4'),
    __metadata("design:type", String)
], ChapterOrderDto.prototype, "id", void 0);
__decorate([
    IsInt(),
    Min(0),
    Max(2147483647),
    __metadata("design:type", Number)
], ChapterOrderDto.prototype, "position", void 0);
export class ReorderChaptersDto {
    chapterOrders;
}
__decorate([
    IsArray(),
    ArrayUnique((chapter) => chapter.id),
    ValidateNested({ each: true }),
    Type(() => ChapterOrderDto),
    __metadata("design:type", Array)
], ReorderChaptersDto.prototype, "chapterOrders", void 0);
//# sourceMappingURL=chapters.dto.js.map