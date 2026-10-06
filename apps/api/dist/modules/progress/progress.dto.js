var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min, } from 'class-validator';
export class CompleteLessonDto {
    percentage;
    reachedLastPage;
    downloaded;
}
__decorate([
    IsOptional(),
    IsNumber(),
    Min(0),
    Max(100),
    __metadata("design:type", Number)
], CompleteLessonDto.prototype, "percentage", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], CompleteLessonDto.prototype, "reachedLastPage", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], CompleteLessonDto.prototype, "downloaded", void 0);
export class VideoProgressDto {
    seconds;
    percentage;
    ended;
}
__decorate([
    IsInt(),
    Min(0),
    Max(2_147_483_647),
    __metadata("design:type", Number)
], VideoProgressDto.prototype, "seconds", void 0);
__decorate([
    IsNumber(),
    Min(0),
    Max(100),
    __metadata("design:type", Number)
], VideoProgressDto.prototype, "percentage", void 0);
__decorate([
    IsOptional(),
    IsBoolean(),
    __metadata("design:type", Boolean)
], VideoProgressDto.prototype, "ended", void 0);
//# sourceMappingURL=progress.dto.js.map