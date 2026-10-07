var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, } from 'typeorm';
import { User } from '../../../users/user.entity.js';
export var QuizScope;
(function (QuizScope) {
    QuizScope["LESSON"] = "LESSON";
    QuizScope["CHAPTER"] = "CHAPTER";
    QuizScope["COURSE"] = "COURSE";
    QuizScope["STANDALONE"] = "STANDALONE";
})(QuizScope || (QuizScope = {}));
export var QuizStatus;
(function (QuizStatus) {
    QuizStatus["DRAFT"] = "DRAFT";
    QuizStatus["PUBLISHED"] = "PUBLISHED";
    QuizStatus["ARCHIVED"] = "ARCHIVED";
})(QuizStatus || (QuizStatus = {}));
export var ReviewPolicy;
(function (ReviewPolicy) {
    ReviewPolicy["AFTER_SUBMIT"] = "AFTER_SUBMIT";
    ReviewPolicy["AFTER_PASS"] = "AFTER_PASS";
    ReviewPolicy["AFTER_EXHAUSTED"] = "AFTER_EXHAUSTED";
    ReviewPolicy["NEVER"] = "NEVER";
})(ReviewPolicy || (ReviewPolicy = {}));
export var QuizDifficulty;
(function (QuizDifficulty) {
    QuizDifficulty["BEGINNER"] = "BEGINNER";
    QuizDifficulty["INTERMEDIATE"] = "INTERMEDIATE";
    QuizDifficulty["ADVANCED"] = "ADVANCED";
})(QuizDifficulty || (QuizDifficulty = {}));
export var GradingPolicy;
(function (GradingPolicy) {
    GradingPolicy["HIGHEST"] = "HIGHEST";
    GradingPolicy["LATEST"] = "LATEST";
})(GradingPolicy || (GradingPolicy = {}));
let QuizEntity = class QuizEntity {
    id;
    title;
    slug;
    description;
    scope;
    targetId;
    status;
    passingScore;
    maxAttempts;
    durationMinutes;
    isRequired;
    reviewPolicy;
    gradingPolicy;
    difficulty;
    tags;
    shuffleQuestions;
    shuffleOptions;
    version;
    createdBy;
    creator;
    publishedAt;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], QuizEntity.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], QuizEntity.prototype, "title", void 0);
__decorate([
    Column({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "slug", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "description", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: QuizScope,
        enumName: 'QuizScope',
        default: QuizScope.LESSON,
    }),
    __metadata("design:type", String)
], QuizEntity.prototype, "scope", void 0);
__decorate([
    Column({ name: 'target_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "targetId", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: QuizStatus,
        enumName: 'QuizStatus',
        default: QuizStatus.DRAFT,
    }),
    __metadata("design:type", String)
], QuizEntity.prototype, "status", void 0);
__decorate([
    Column({ name: 'passing_score', type: 'smallint', default: 80 }),
    __metadata("design:type", Number)
], QuizEntity.prototype, "passingScore", void 0);
__decorate([
    Column({ name: 'max_attempts', type: 'smallint', nullable: true }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "maxAttempts", void 0);
__decorate([
    Column({ name: 'duration_minutes', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "durationMinutes", void 0);
__decorate([
    Column({ name: 'is_required', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], QuizEntity.prototype, "isRequired", void 0);
__decorate([
    Column({
        name: 'review_policy',
        type: 'enum',
        enum: ReviewPolicy,
        enumName: 'ReviewPolicy',
        default: ReviewPolicy.AFTER_SUBMIT,
    }),
    __metadata("design:type", String)
], QuizEntity.prototype, "reviewPolicy", void 0);
__decorate([
    Column({
        name: 'grading_policy',
        type: 'enum',
        enum: GradingPolicy,
        enumName: 'GradingPolicy',
        default: GradingPolicy.HIGHEST,
    }),
    __metadata("design:type", String)
], QuizEntity.prototype, "gradingPolicy", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: QuizDifficulty,
        enumName: 'QuizDifficulty',
        nullable: true,
    }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "difficulty", void 0);
__decorate([
    Column({ type: 'text', array: true, default: () => `'{}'` }),
    __metadata("design:type", Array)
], QuizEntity.prototype, "tags", void 0);
__decorate([
    Column({ name: 'shuffle_questions', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], QuizEntity.prototype, "shuffleQuestions", void 0);
__decorate([
    Column({ name: 'shuffle_options', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], QuizEntity.prototype, "shuffleOptions", void 0);
__decorate([
    Column({ type: 'integer', default: 1 }),
    __metadata("design:type", Number)
], QuizEntity.prototype, "version", void 0);
__decorate([
    Column({ name: 'created_by', type: 'uuid' }),
    __metadata("design:type", String)
], QuizEntity.prototype, "createdBy", void 0);
__decorate([
    ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }),
    JoinColumn({
        name: 'created_by',
        foreignKeyConstraintName: 'FK_quizzes_users',
    }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "creator", void 0);
__decorate([
    Column({ name: 'published_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], QuizEntity.prototype, "publishedAt", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizEntity.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizEntity.prototype, "updatedAt", void 0);
QuizEntity = __decorate([
    Entity('quizzes'),
    Index('IDX_quizzes_scope_target', ['scope', 'targetId']),
    Index('UQ_quizzes_slug', ['slug'], {
        unique: true,
        where: 'slug IS NOT NULL',
    })
], QuizEntity);
export { QuizEntity };
//# sourceMappingURL=quiz.entity.js.map