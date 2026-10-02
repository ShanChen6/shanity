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
import { Course } from './course.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
let Chapter = class Chapter {
    id;
    courseId;
    course;
    lessons;
    title;
    description;
    position;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], Chapter.prototype, "id", void 0);
__decorate([
    Column({ name: 'course_id', type: 'uuid' }),
    __metadata("design:type", String)
], Chapter.prototype, "courseId", void 0);
__decorate([
    ManyToOne(() => Course, (course) => course.chapters, {
        nullable: false,
        onDelete: 'CASCADE',
    }),
    JoinColumn({
        name: 'course_id',
        foreignKeyConstraintName: 'FK_chapters_course',
    }),
    __metadata("design:type", Object)
], Chapter.prototype, "course", void 0);
__decorate([
    OneToMany(() => Lesson, (lesson) => lesson.chapter),
    __metadata("design:type", Object)
], Chapter.prototype, "lessons", void 0);
__decorate([
    Column({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], Chapter.prototype, "title", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Chapter.prototype, "description", void 0);
__decorate([
    Column({ type: 'integer' }),
    __metadata("design:type", Number)
], Chapter.prototype, "position", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Chapter.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], Chapter.prototype, "updatedAt", void 0);
Chapter = __decorate([
    Entity('chapters'),
    Index('chapters_course_id_idx', ['courseId']),
    Index('chapters_course_position_idx', ['courseId', 'position'])
], Chapter);
export { Chapter };
//# sourceMappingURL=chapter.entity.js.map