var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
export var LessonProgressStatus;
(function (LessonProgressStatus) {
    LessonProgressStatus["NOT_STARTED"] = "NOT_STARTED";
    LessonProgressStatus["IN_PROGRESS"] = "IN_PROGRESS";
    LessonProgressStatus["COMPLETED"] = "COMPLETED";
})(LessonProgressStatus || (LessonProgressStatus = {}));
let LessonProgress = class LessonProgress {
    id;
    userId;
    enrollmentId;
    lessonId;
    courseId;
    status;
    lastPosition;
    startedAt;
    completedAt;
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
    Column({ name: 'enrollment_id', type: 'uuid' }),
    __metadata("design:type", String)
], LessonProgress.prototype, "enrollmentId", void 0);
__decorate([
    Column({ name: 'lesson_id', type: 'uuid' }),
    __metadata("design:type", String)
], LessonProgress.prototype, "lessonId", void 0);
__decorate([
    Column({ name: 'course_id', type: 'uuid' }),
    __metadata("design:type", String)
], LessonProgress.prototype, "courseId", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: LessonProgressStatus,
        enumName: 'LessonProgressStatus',
        default: LessonProgressStatus.NOT_STARTED,
    }),
    __metadata("design:type", String)
], LessonProgress.prototype, "status", void 0);
__decorate([
    Column({ name: 'last_position', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], LessonProgress.prototype, "lastPosition", void 0);
__decorate([
    Column({ name: 'started_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "startedAt", void 0);
__decorate([
    Column({ name: 'completed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], LessonProgress.prototype, "completedAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], LessonProgress.prototype, "updatedAt", void 0);
LessonProgress = __decorate([
    Entity('lesson_progress'),
    Unique('UQ_lesson_progress_user_lesson', ['userId', 'lessonId']),
    Index('lesson_progress_course_user_idx', ['courseId', 'userId'])
], LessonProgress);
export { LessonProgress };
//# sourceMappingURL=lesson-progress.entity.js.map