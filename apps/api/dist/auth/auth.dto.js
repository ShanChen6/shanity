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
import { IsEmail, IsIn, IsOptional, IsInt, IsString, Length, Max, MaxLength, Matches, Min, } from 'class-validator';
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
    search;
    role;
    status;
    page = 1;
    limit = 20;
}
__decorate([
    IsOptional(),
    Transform(({ value }) => typeof value === 'string' ? value.trim() : value),
    IsString(),
    MaxLength(254),
    __metadata("design:type", String)
], ListUsersQueryDto.prototype, "search", void 0);
__decorate([
    IsOptional(),
    IsIn(['student', 'instructor', 'admin']),
    __metadata("design:type", String)
], ListUsersQueryDto.prototype, "role", void 0);
__decorate([
    IsOptional(),
    IsIn(['active', 'disabled']),
    __metadata("design:type", String)
], ListUsersQueryDto.prototype, "status", void 0);
__decorate([
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(2147483647),
    __metadata("design:type", Number)
], ListUsersQueryDto.prototype, "page", void 0);
__decorate([
    Type(() => Number),
    IsInt(),
    Min(1),
    Max(100),
    __metadata("design:type", Number)
], ListUsersQueryDto.prototype, "limit", void 0);
export class ChangeUserRoleDto {
    role;
}
__decorate([
    IsIn(['STUDENT', 'INSTRUCTOR', 'ADMIN']),
    __metadata("design:type", String)
], ChangeUserRoleDto.prototype, "role", void 0);
export class ChangeUserStatusDto {
    status;
}
__decorate([
    IsIn(['ACTIVE', 'DISABLED']),
    __metadata("design:type", String)
], ChangeUserStatusDto.prototype, "status", void 0);
export class CreateUserDto extends RegisterDto {
    role;
}
__decorate([
    IsIn(['STUDENT', 'INSTRUCTOR', 'ADMIN']),
    __metadata("design:type", String)
], CreateUserDto.prototype, "role", void 0);
export class UpdateUserDto extends ProfileDto {
    email;
}
__decorate([
    Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value),
    IsEmail(),
    MaxLength(254),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "email", void 0);
//# sourceMappingURL=auth.dto.js.map