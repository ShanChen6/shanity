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
import { QuizAttemptEntity } from './quiz-attempt.entity.js';
let AttemptAnswerEntity = class AttemptAnswerEntity {
    id;
    attemptId;
    attempt;
    questionId;
    selectedOptionIds;
    isCorrect;
    pointsEarned;
    savedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], AttemptAnswerEntity.prototype, "id", void 0);
__decorate([
    Column({ name: 'attempt_id', type: 'uuid' }),
    __metadata("design:type", String)
], AttemptAnswerEntity.prototype, "attemptId", void 0);
__decorate([
    ManyToOne(() => QuizAttemptEntity, (attempt) => attempt.answers, {
        nullable: false,
        onDelete: 'CASCADE',
    }),
    JoinColumn({
        name: 'attempt_id',
        foreignKeyConstraintName: 'FK_attempt_answers_quiz_attempts',
    }),
    __metadata("design:type", Object)
], AttemptAnswerEntity.prototype, "attempt", void 0);
__decorate([
    Column({ name: 'question_id', type: 'uuid' }),
    __metadata("design:type", String)
], AttemptAnswerEntity.prototype, "questionId", void 0);
__decorate([
    Column({
        name: 'selected_option_ids',
        type: 'uuid',
        array: true,
        default: () => `'{}'`,
    }),
    __metadata("design:type", Array)
], AttemptAnswerEntity.prototype, "selectedOptionIds", void 0);
__decorate([
    Column({ name: 'is_correct', type: 'boolean', nullable: true }),
    __metadata("design:type", Object)
], AttemptAnswerEntity.prototype, "isCorrect", void 0);
__decorate([
    Column({
        name: 'points_earned',
        type: 'smallint',
        nullable: true,
        default: 0,
    }),
    __metadata("design:type", Object)
], AttemptAnswerEntity.prototype, "pointsEarned", void 0);
__decorate([
    Column({ name: 'saved_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], AttemptAnswerEntity.prototype, "savedAt", void 0);
AttemptAnswerEntity = __decorate([
    Entity('attempt_answers'),
    Index('IDX_attempt_answers_attempt_question', ['attemptId', 'questionId'], {
        unique: true,
    })
], AttemptAnswerEntity);
export { AttemptAnswerEntity };
//# sourceMappingURL=attempt-answer.entity.js.map