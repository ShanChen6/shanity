var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { Enrollment } from './enrollment.entity.js';
import { CourseStatus } from './course-status.js';
let Course = class Course {
    id;
    title;
    slug;
    description;
    shortDescription;
    thumbnail;
    category;
    level;
    language;
    price;
    isSequential;
    status;
    instructorId;
    instructor;
    ownerId;
    publishedAt;
    createdAt;
    updatedAt;
    chapters;
    enrollments;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], Course.prototype, "id", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], Course.prototype, "title", void 0);
__decorate([
    Column({ type: 'text', unique: true }),
    __metadata("design:type", String)
], Course.prototype, "slug", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Course.prototype, "description", void 0);
__decorate([
    Column({ name: 'short_description', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Course.prototype, "shortDescription", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Course.prototype, "thumbnail", void 0);
__decorate([
    Column({ type: 'text', default: 'General' }),
    __metadata("design:type", String)
], Course.prototype, "category", void 0);
__decorate([
    Column({ type: 'text', default: 'Beginner' }),
    __metadata("design:type", String)
], Course.prototype, "level", void 0);
__decorate([
    Column({ type: 'text', default: 'vi' }),
    __metadata("design:type", String)
], Course.prototype, "language", void 0);
__decorate([
    Column({ type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], Course.prototype, "price", void 0);
__decorate([
    Column({ name: 'is_sequential', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], Course.prototype, "isSequential", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: CourseStatus,
        enumName: 'CourseStatus',
        default: CourseStatus.DRAFT,
    }),
    __metadata("design:type", String)
], Course.prototype, "status", void 0);
__decorate([
    Column({ name: 'instructor_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], Course.prototype, "instructorId", void 0);
__decorate([
    ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }),
    JoinColumn({
        name: 'instructor_id',
        foreignKeyConstraintName: 'FK_courses_instructor',
    }),
    __metadata("design:type", Object)
], Course.prototype, "instructor", void 0);
__decorate([
    Column({ name: 'owner_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], Course.prototype, "ownerId", void 0);
__decorate([
    Column({ name: 'published_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], Course.prototype, "publishedAt", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Course.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Course.prototype, "updatedAt", void 0);
__decorate([
    OneToMany(() => Chapter, (chapter) => chapter.course),
    __metadata("design:type", Array)
], Course.prototype, "chapters", void 0);
__decorate([
    OneToMany(() => Enrollment, (enrollment) => enrollment.course),
    __metadata("design:type", Array)
], Course.prototype, "enrollments", void 0);
Course = __decorate([
    Entity('courses'),
    Index('courses_instructor_idx', ['instructorId']),
    Index('courses_status_published_at_idx', ['status', 'publishedAt'])
], Course);
export { Course };
//# sourceMappingURL=course.entity.js.map