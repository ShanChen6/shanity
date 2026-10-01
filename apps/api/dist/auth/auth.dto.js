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
import { IsEmail, IsInt, IsString, Length, Max, MaxLength, Matches, Min, } from 'class-validator';
export class LoginDto {
    email;
    password;
}
__decorate([
    Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value),
    IsEmail(),
    MaxLength(254),
    __metadata("design:type", String)
], LoginDto.prototype, "email", void 0);
__decorate([
    IsString(),
    Length(12, 128),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
export class RegisterDto extends LoginDto {
    displayName;
}
__decorate([
    Transform(({ value }) => typeof value === 'string' ? value.trim() : value),
    IsString(),
    Length(1, 100),
    Matches(/\S/),
    __metadata("design:type", String)
], RegisterDto.prototype, "displayName", void 0);
export class ProfileDto {
    displayName;
}
__decorate([
    Transform(({ value }) => typeof value === 'string' ? value.trim() : value),
    IsString(),
    Length(1, 100),
    Matches(/\S/),
    __metadata("design:type", String)
], ProfileDto.prototype, "displayName", void 0);
export class ListUsersQueryDto {
    page = 1;
    limit = 20;
}
__decorate([
    Type(() => Number),
    IsInt(),
    Min(1),
    __metadata("design:type", Number)
], ListUsersQueryDto.prototype, "page", void 0);
__decorate([
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(100),
    __metadata("design:type", Number)
], ListUsersQueryDto.prototype, "limit", void 0);
//# sourceMappingURL=auth.dto.js.map