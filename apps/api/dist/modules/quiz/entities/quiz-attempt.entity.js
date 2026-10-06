var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, } from 'typeorm';
import { User } from '../../../users/user.entity.js';
import { QuizEntity } from './quiz.entity.js';
import { AttemptAnswerEntity } from './attempt-answer.entity.js';
export var QuizAttemptStatus;
(function (QuizAttemptStatus) {
    QuizAttemptStatus["IN_PROGRESS"] = "IN_PROGRESS";
    QuizAttemptStatus["SUBMITTED"] = "SUBMITTED";
    QuizAttemptStatus["TIMED_OUT"] = "TIMED_OUT";
    QuizAttemptStatus["ABANDONED"] = "ABANDONED";
})(QuizAttemptStatus || (QuizAttemptStatus = {}));
let QuizAttemptEntity = class QuizAttemptEntity {
    id;
    userId;
    user;
    quizId;
    quiz;
    quizVersion;
    attemptNumber;
    quizSnapshot;
    status;
    startedAt;
    expiresAt;
    submittedAt;
    score;
    isPassed;
    answers;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], QuizAttemptEntity.prototype, "id", void 0);
__decorate([
    Column({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], QuizAttemptEntity.prototype, "userId", void 0);
__decorate([
    ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }),
    JoinColumn({
        name: 'user_id',
        foreignKeyConstraintName: 'FK_quiz_attempts_users',
    }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "user", void 0);
__decorate([
    Column({ name: 'quiz_id', type: 'uuid' }),
    __metadata("design:type", String)
], QuizAttemptEntity.prototype, "quizId", void 0);
__decorate([
    ManyToOne(() => QuizEntity, { nullable: false, onDelete: 'RESTRICT' }),
    JoinColumn({
        name: 'quiz_id',
        foreignKeyConstraintName: 'FK_quiz_attempts_quizzes',
    }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "quiz", void 0);
__decorate([
    Column({ name: 'quiz_version', type: 'integer' }),
    __metadata("design:type", Number)
], QuizAttemptEntity.prototype, "quizVersion", void 0);
__decorate([
    Column({ name: 'attempt_number', type: 'smallint' }),
    __metadata("design:type", Number)
], QuizAttemptEntity.prototype, "attemptNumber", void 0);
__decorate([
    Column({ name: 'quiz_snapshot', type: 'jsonb' }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "quizSnapshot", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: QuizAttemptStatus,
        enumName: 'QuizAttemptStatus',
        default: QuizAttemptStatus.IN_PROGRESS,
    }),
    __metadata("design:type", String)
], QuizAttemptEntity.prototype, "status", void 0);
__decorate([
    Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizAttemptEntity.prototype, "startedAt", void 0);
__decorate([
    Column({ name: 'expires_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "expiresAt", void 0);
__decorate([
    Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "submittedAt", void 0);
__decorate([
    Column({ type: 'smallint', nullable: true }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "score", void 0);
__decorate([
    Column({ name: 'is_passed', type: 'boolean', nullable: true }),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "isPassed", void 0);
__decorate([
    OneToMany(() => AttemptAnswerEntity, (answer) => answer.attempt),
    __metadata("design:type", Object)
], QuizAttemptEntity.prototype, "answers", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizAttemptEntity.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizAttemptEntity.prototype, "updatedAt", void 0);
QuizAttemptEntity = __decorate([
    Entity('quiz_attempts'),
    Index('IDX_quiz_attempts_user_quiz', ['userId', 'quizId', 'status']),
    Index('UQ_quiz_attempts_active', ['userId', 'quizId'], {
        unique: true,
        where: `status = 'IN_PROGRESS'`,
    }),
    Unique('UQ_quiz_attempts_user_quiz_number', [
        'userId',
        'quizId',
        'attemptNumber',
    ])
], QuizAttemptEntity);
export { QuizAttemptEntity };
//# sourceMappingURL=quiz-attempt.entity.js.map