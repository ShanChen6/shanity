var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Enrollment } from '../courses/enrollment.entity.js';
let User = class User {
    id;
    email;
    displayName;
    passwordHash;
    status;
    avatarKey;
    createdAt;
    updatedAt;
    enrollments;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], User.prototype, "id", void 0);
__decorate([
    Column({ type: 'text', unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    Column({ name: 'display_name', type: 'text' }),
    __metadata("design:type", String)
], User.prototype, "displayName", void 0);
__decorate([
    Column({
        name: 'password_hash',
        type: 'text',
        nullable: true,
        select: false,
    }),
    __metadata("design:type", Object)
], User.prototype, "passwordHash", void 0);
__decorate([
    Column({ type: 'text', default: 'active' }),
    __metadata("design:type", String)
], User.prototype, "status", void 0);
__decorate([
    Column({ name: 'avatar_key', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "avatarKey", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'update_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
__decorate([
    OneToMany(() => Enrollment, (enrollment) => enrollment.user),
    __metadata("design:type", Array)
], User.prototype, "enrollments", void 0);
User = __decorate([
    Entity('users')
], User);
export { User };
//# sourceMappingURL=user.entity.js.map