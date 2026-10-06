var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, } from 'typeorm';
import { QuizQuestionEntity } from './quiz-question.entity.js';
let QuizOptionEntity = class QuizOptionEntity {
    id;
    questionId;
    question;
    content;
    position;
    isCorrect;
    createdAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], QuizOptionEntity.prototype, "id", void 0);
__decorate([
    Column({ name: 'question_id', type: 'uuid' }),
    __metadata("design:type", String)
], QuizOptionEntity.prototype, "questionId", void 0);
__decorate([
    ManyToOne(() => QuizQuestionEntity, (question) => question.options, {
        nullable: false,
        onDelete: 'CASCADE',
    }),
    JoinColumn({
        name: 'question_id',
        foreignKeyConstraintName: 'FK_quiz_options_questions',
    }),
    __metadata("design:type", Object)
], QuizOptionEntity.prototype, "question", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], QuizOptionEntity.prototype, "content", void 0);
__decorate([
    Column({ type: 'smallint', default: 1 }),
    __metadata("design:type", Number)
], QuizOptionEntity.prototype, "position", void 0);
__decorate([
    Exclude({ toPlainOnly: true }),
    Column({ name: 'is_correct', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], QuizOptionEntity.prototype, "isCorrect", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizOptionEntity.prototype, "createdAt", void 0);
QuizOptionEntity = __decorate([
    Entity('quiz_options'),
    Index('IDX_quiz_options_question_position', ['questionId', 'position'])
], QuizOptionEntity);
export { QuizOptionEntity };
//# sourceMappingURL=quiz-option.entity.js.map