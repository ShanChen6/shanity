var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, } from 'typeorm';
import { Course } from './course.entity.js';
import { User } from '../users/user.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
let Enrollment = class Enrollment {
    id;
    userId;
    user;
    courseId;
    course;
    enrolledAt;
    revokedAt;
    lastAccessedLessonId;
    lastAccessedLesson;
    lastAccessedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], Enrollment.prototype, "id", void 0);
__decorate([
    Column({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], Enrollment.prototype, "userId", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.enrollments, {
        nullable: false,
        onDelete: 'CASCADE',
    }),
    JoinColumn({
        name: 'user_id',
        foreignKeyConstraintName: 'FK_enrollments_user',
    }),
    __metadata("design:type", Object)
], Enrollment.prototype, "user", void 0);
__decorate([
    Column({ name: 'course_id', type: 'uuid' }),
    __metadata("design:type", String)
], Enrollment.prototype, "courseId", void 0);
__decorate([
    ManyToOne(() => Course, (course) => course.enrollments, {
        nullable: false,
        onDelete: 'CASCADE',
    }),
    JoinColumn({
        name: 'course_id',
        foreignKeyConstraintName: 'FK_enrollments_course',
    }),
    __metadata("design:type", Object)
], Enrollment.prototype, "course", void 0);
__decorate([
    Column({ name: 'enrolled_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Enrollment.prototype, "enrolledAt", void 0);
__decorate([
    Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], Enrollment.prototype, "revokedAt", void 0);
__decorate([
    Column({ name: 'last_accessed_lesson_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], Enrollment.prototype, "lastAccessedLessonId", void 0);
__decorate([
    ManyToOne(() => Lesson, { nullable: true, onDelete: 'SET NULL' }),
    JoinColumn({
        name: 'last_accessed_lesson_id',
        foreignKeyConstraintName: 'FK_enrollments_last_accessed_lesson',
    }),
    __metadata("design:type", Object)
], Enrollment.prototype, "lastAccessedLesson", void 0);
__decorate([
    Column({ name: 'last_accessed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], Enrollment.prototype, "lastAccessedAt", void 0);
Enrollment = __decorate([
    Entity('enrollments'),
    Unique('enrollments_user_id_course_id_key', ['userId', 'courseId']),
    Index('enrollments_user_idx', ['userId']),
    Index('enrollments_course_idx', ['courseId']),
    Index('idx_enrollments_user_last_accessed', ['userId', 'lastAccessedAt'])
], Enrollment);
export { Enrollment };
//# sourceMappingURL=enrollment.entity.js.map