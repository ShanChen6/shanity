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
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';
import { Lesson } from '../../lessons/entities/lesson.entity.js';
export var LessonProgressStatus;
(function (LessonProgressStatus) {
    LessonProgressStatus["IN_PROGRESS"] = "IN_PROGRESS";
    LessonProgressStatus["COMPLETED"] = "COMPLETED";
})(LessonProgressStatus || (LessonProgressStatus = {}));
let LessonProgress = class LessonProgress {
    id;
    userId;
    user;
    lessonId;
    lesson;
    courseId;
    course;
    status;
    lastPosition;
    startedAt;
    lastAccessedAt;
    completedAt;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], LessonProgress.prototype, "id", void 0);
__decorate([
    Column({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], LessonProgress.prototype, "userId", void 0);
__decorate([
    ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' }),
    JoinColumn({
        name: 'user_id',
        foreignKeyConstraintName: 'FK_lesson_progress_user',
    }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "user", void 0);
__decorate([
    Column({ name: 'lesson_id', type: 'uuid' }),
    __metadata("design:type", String)
], LessonProgress.prototype, "lessonId", void 0);
__decorate([
    ManyToOne(() => Lesson, { nullable: false, onDelete: 'CASCADE' }),
    JoinColumn({
        name: 'lesson_id',
        foreignKeyConstraintName: 'FK_lesson_progress_lesson',
    }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "lesson", void 0);
__decorate([
    Column({ name: 'course_id', type: 'uuid' }),
    __metadata("design:type", String)
], LessonProgress.prototype, "courseId", void 0);
__decorate([
    ManyToOne(() => Course, { nullable: false, onDelete: 'CASCADE' }),
    JoinColumn({
        name: 'course_id',
        foreignKeyConstraintName: 'FK_lesson_progress_course',
    }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "course", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: LessonProgressStatus,
        enumName: 'LessonProgressStatus',
        default: LessonProgressStatus.IN_PROGRESS,
    }),
    __metadata("design:type", String)
], LessonProgress.prototype, "status", void 0);
__decorate([
    Column({
        name: 'last_position',
        type: 'integer',
        nullable: true,
        default: 0,
    }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "lastPosition", void 0);
__decorate([
    Column({
        name: 'started_at',
        type: 'timestamptz',
        default: () => 'CURRENT_TIMESTAMP',
    }),
    __metadata("design:type", Date)
], LessonProgress.prototype, "startedAt", void 0);
__decorate([
    Column({
        name: 'last_accessed_at',
        type: 'timestamptz',
        default: () => 'CURRENT_TIMESTAMP',
    }),
    __metadata("design:type", Date)
], LessonProgress.prototype, "lastAccessedAt", void 0);
__decorate([
    Column({ name: 'completed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "completedAt", void 0);
__decorate([
    Column({
        name: 'created_at',
        type: 'timestamptz',
        default: () => 'CURRENT_TIMESTAMP',
    }),
    __metadata("design:type", Date)
], LessonProgress.prototype, "createdAt", void 0);
__decorate([
    Column({
        name: 'updated_at',
        type: 'timestamptz',
        default: () => 'CURRENT_TIMESTAMP',
    }),
    __metadata("design:type", Date)
], LessonProgress.prototype, "updatedAt", void 0);
LessonProgress = __decorate([
    Entity('lesson_progress'),
    Unique('UQ_lesson_progress_user_lesson', ['userId', 'lessonId']),
    Index('idx_lesson_progress_user_course', ['userId', 'courseId']),
    Index('idx_lesson_progress_user_lesson', ['userId', 'lessonId']),
    Index('idx_lesson_progress_completed', ['userId', 'courseId', 'status'])
], LessonProgress);
export { LessonProgress };
//# sourceMappingURL=lesson-progress.entity.js.map