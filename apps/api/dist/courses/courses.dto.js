var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Transform } from 'class-transformer';
import { IsOptional, ValidateIf, IsString, Length, Matches, IsIn, IsInt, Min, Max, } from 'class-validator';
const trimString = ({ value }) => typeof value === 'string' ? value.trim() : value;
export class CreateCourseDto {
    category;
    level;
    language;
    price;
    title;
    slug;
    description;
    shortDescription;
    thumbnail;
}
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsString(),
    Transform(trimString),
    Length(1, 100),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "category", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsIn(['Beginner', 'Intermediate', 'Advanced']),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "level", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsString(),
    Transform(trimString),
    Length(2, 35),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "language", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsInt(),
    Min(0),
    Max(2147483647),
    __metadata("design:type", Number)
], CreateCourseDto.prototype, "price", void 0);
__decorate([
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "title", void 0);
__decorate([
    Transform(trimString),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "slug", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], CreateCourseDto.prototype, "description", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], CreateCourseDto.prototype, "shortDescription", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], CreateCourseDto.prototype, "thumbnail", void 0);
export class UpdateCourseDto {
    category;
    level;
    language;
    price;
    title;
    slug;
    description;
    shortDescription;
    thumbnail;
}
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsString(),
    Transform(trimString),
    Length(1, 100),
    __metadata("design:type", String)
], UpdateCourseDto.prototype, "category", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsIn(['Beginner', 'Intermediate', 'Advanced']),
    __metadata("design:type", String)
], UpdateCourseDto.prototype, "level", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsString(),
    Transform(trimString),
    Length(2, 35),
    __metadata("design:type", String)
], UpdateCourseDto.prototype, "language", void 0);
__decorate([
    ValidateIf((_object, value) => value !== undefined),
    IsInt(),
    Min(0),
    Max(2147483647),
    __metadata("design:type", Number)
], UpdateCourseDto.prototype, "price", void 0);
__decorate([
    Transform(trimString),
    IsOptional(),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], UpdateCourseDto.prototype, "title", void 0);
__decorate([
    Transform(trimString),
    IsOptional(),
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], UpdateCourseDto.prototype, "slug", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], UpdateCourseDto.prototype, "description", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], UpdateCourseDto.prototype, "shortDescription", void 0);
__decorate([
    IsOptional(),
    IsString(),
    __metadata("design:type", Object)
], UpdateCourseDto.prototype, "thumbnail", void 0);
//# sourceMappingURL=courses.dto.js.map