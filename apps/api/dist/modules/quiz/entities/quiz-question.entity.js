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
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, } from 'typeorm';
import { QuizEntity } from './quiz.entity.js';
import { QuizOptionEntity } from './quiz-option.entity.js';
export var QuizQuestionType;
(function (QuizQuestionType) {
    QuizQuestionType["SINGLE_CHOICE"] = "SINGLE_CHOICE";
    QuizQuestionType["MULTIPLE_CHOICE"] = "MULTIPLE_CHOICE";
})(QuizQuestionType || (QuizQuestionType = {}));
let QuizQuestionEntity = class QuizQuestionEntity {
    id;
    quizId;
    quiz;
    type;
    content;
    position;
    points;
    explanation;
    options;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], QuizQuestionEntity.prototype, "id", void 0);
__decorate([
    Column({ name: 'quiz_id', type: 'uuid' }),
    __metadata("design:type", String)
], QuizQuestionEntity.prototype, "quizId", void 0);
__decorate([
    ManyToOne(() => QuizEntity, { nullable: false, onDelete: 'CASCADE' }),
    JoinColumn({
        name: 'quiz_id',
        foreignKeyConstraintName: 'FK_quiz_questions_quizzes',
    }),
    __metadata("design:type", Object)
], QuizQuestionEntity.prototype, "quiz", void 0);
__decorate([
    Column({
        type: 'enum',
        enum: QuizQuestionType,
        enumName: 'QuizQuestionType',
        default: QuizQuestionType.SINGLE_CHOICE,
    }),
    __metadata("design:type", String)
], QuizQuestionEntity.prototype, "type", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], QuizQuestionEntity.prototype, "content", void 0);
__decorate([
    Column({ type: 'smallint', default: 1 }),
    __metadata("design:type", Number)
], QuizQuestionEntity.prototype, "position", void 0);
__decorate([
    Column({ type: 'smallint', default: 10 }),
    __metadata("design:type", Number)
], QuizQuestionEntity.prototype, "points", void 0);
__decorate([
    Exclude({ toPlainOnly: true }),
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], QuizQuestionEntity.prototype, "explanation", void 0);
__decorate([
    OneToMany(() => QuizOptionEntity, (option) => option.question),
    __metadata("design:type", Object)
], QuizQuestionEntity.prototype, "options", void 0);
__decorate([
    Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizQuestionEntity.prototype, "createdAt", void 0);
__decorate([
    Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], QuizQuestionEntity.prototype, "updatedAt", void 0);
QuizQuestionEntity = __decorate([
    Entity('quiz_questions'),
    Index('IDX_quiz_questions_quiz_position', ['quizId', 'position'])
], QuizQuestionEntity);
export { QuizQuestionEntity };
//# sourceMappingURL=quiz-question.entity.js.map