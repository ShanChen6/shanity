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
import { Allow, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, } from 'class-validator';
export class PublicCourseQueryDto {
    page = 1;
    limit = 10;
    search;
    instructorId;
    sortBy = 'publishedAt';
    sortOrder = 'DESC';
    status;
}
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    __metadata("design:type", Object)
], PublicCourseQueryDto.prototype, "page", void 0);
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(50),
    __metadata("design:type", Object)
], PublicCourseQueryDto.prototype, "limit", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => typeof value === 'string' ? value.trim() : value),
    IsString(),
    MaxLength(100),
    __metadata("design:type", String)
], PublicCourseQueryDto.prototype, "search", void 0);
__decorate([
    IsOptional(),
    IsUUID('4'),
    __metadata("design:type", String)
], PublicCourseQueryDto.prototype, "instructorId", void 0);
__decorate([
    IsOptional(),
    IsIn(['publishedAt', 'createdAt']),
    __metadata("design:type", String)
], PublicCourseQueryDto.prototype, "sortBy", void 0);
__decorate([
    IsOptional(),
    IsIn(['ASC', 'DESC']),
    __metadata("design:type", String)
], PublicCourseQueryDto.prototype, "sortOrder", void 0);
__decorate([
    IsOptional(),
    Allow(),
    __metadata("design:type", String)
], PublicCourseQueryDto.prototype, "status", void 0);
//# sourceMappingURL=public-courses.dto.js.map