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
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, } from 'class-validator';
export const STUDENT_SORTS = [
    'percentage_desc',
    'percentage_asc',
    'last_accessed_desc',
];
export const STUDENT_STATUSES = [
    'ALL',
    'COMPLETED',
    'IN_PROGRESS',
    'NOT_STARTED',
];
export class StudentsProgressQueryDto {
    page = 1;
    limit = 20;
    search;
    sortBy = 'last_accessed_desc';
    status = 'ALL';
}
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    __metadata("design:type", Number)
], StudentsProgressQueryDto.prototype, "page", void 0);
__decorate([
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(100),
    __metadata("design:type", Number)
], StudentsProgressQueryDto.prototype, "limit", void 0);
__decorate([
    IsOptional(),
    Transform(({ value }) => typeof value === 'string' ? value.trim() : value),
    IsString(),
    MaxLength(100),
    __metadata("design:type", String)
], StudentsProgressQueryDto.prototype, "search", void 0);
__decorate([
    IsOptional(),
    IsIn(STUDENT_SORTS),
    __metadata("design:type", String)
], StudentsProgressQueryDto.prototype, "sortBy", void 0);
__decorate([
    IsOptional(),
    IsIn(STUDENT_STATUSES),
    __metadata("design:type", String)
], StudentsProgressQueryDto.prototype, "status", void 0);
//# sourceMappingURL=students-progress-query.dto.js.map