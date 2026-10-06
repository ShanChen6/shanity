var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { sanitizeLessonHtml } from '../../../security/html-sanitizer.js';
import { InstructorQuestionResponseDto } from '../dto/quiz-question-response.dto.js';
import { MAX_OPTIONS_PER_QUESTION, MAX_REORDER_ITEMS, } from '../dto/quiz-question-authoring.dto.js';
import { QuizEntity, QuizStatus } from '../entities/quiz.entity.js';
import { QuizOptionEntity } from '../entities/quiz-option.entity.js';
import { QuizQuestionEntity, QuizQuestionType, } from '../entities/quiz-question.entity.js';
import { quizNotEditable } from './quiz-authoring.service.js';
import { QUIZ_NOT_FOUND } from './quiz-learner-access.service.js';
import { QuizQuestionsService } from './quiz-questions.service.js';
import { validateQuizStructure } from './quiz-structure.js';
export const MAX_QUESTIONS_PER_QUIZ = MAX_REORDER_ITEMS;
const body = (statusCode, code) => ({
    statusCode,
    message: code,
    code,
});
const badRequest = (code) => new BadRequestException(body(400, code));
const QUESTION_NOT_FOUND = body(404, 'QUESTION_NOT_FOUND');
const OPTION_NOT_FOUND = body(404, 'OPTION_NOT_FOUND');
function cleanHtml(value, code) {
    const clean = sanitizeLessonHtml(value);
    if (!clean)
        throw badRequest(code);
    return clean;
}
const cleanExplanation = (value) => value === undefined || value === null
    ? value
    : sanitizeLessonHtml(value) || null;
let QuizQuestionAuthoringService = class QuizQuestionAuthoringService {
    dataSource;
    questions;
    constructor(dataSource, questions) {
        this.dataSource = dataSource;
        this.questions = questions;
    }
    async createQuestion(quizId, dto) {
        const id = await this.dataSource.transaction(async (manager) => {
            assertDraft(await this.lockQuiz(manager, quizId));
            const type = dto.type ?? QuizQuestionType.SINGLE_CHOICE;
            const options = (dto.options ?? []).map((option) => ({
                content: cleanHtml(option.content, 'OPTION_CONTENT_REQUIRED'),
                isCorrect: option.isCorrect ?? false,
            }));
            assertCorrectCountFits(type, options.filter((option) => option.isCorrect).length);
            const [{ count, next }] = await manager.query(`SELECT count(*)::int AS count, coalesce(max(position), 0) + 1 AS next
         FROM quiz_questions WHERE quiz_id = $1`, [quizId]);
            if (count >= MAX_QUESTIONS_PER_QUIZ)
                throw new ConflictException(body(409, 'QUESTION_LIMIT_REACHED'));
            const questions = manager.getRepository(QuizQuestionEntity);
            const { identifiers } = await questions.insert(questions.create({
                quizId,
                type,
                content: cleanHtml(dto.content, 'QUESTION_CONTENT_REQUIRED'),
                position: next,
                points: dto.points ?? 10,
                explanation: cleanExplanation(dto.explanation) ?? null,
            }));
            const questionId = identifiers[0].id;
            if (options.length) {
                const repository = manager.getRepository(QuizOptionEntity);
                await repository.insert(options.map((option, index) => repository.create({
                    questionId,
                    content: option.content,
                    isCorrect: option.isCorrect,
                    position: index + 1,
                })));
            }
            await touchQuiz(manager, quizId);
            return questionId;
        });
        return this.question(id);
    }
    async updateQuestion(quizId, questionId, dto) {
        await this.dataSource.transaction(async (manager) => {
            const quiz = await this.lockQuiz(manager, quizId);
            const question = await lockQuestion(manager, questionId, quizId);
            assertDraft(quiz);
            const changes = {};
            if (dto.content !== undefined)
                changes.content = cleanHtml(dto.content, 'QUESTION_CONTENT_REQUIRED');
            if (dto.type !== undefined)
                changes.type = dto.type;
            if (dto.points !== undefined)
                changes.points = dto.points;
            if (dto.explanation !== undefined)
                changes.explanation = cleanExplanation(dto.explanation);
            if (!Object.keys(changes).length)
                return;
            if (dto.type === QuizQuestionType.SINGLE_CHOICE)
                assertCorrectCountFits(dto.type, await correctCount(manager, question.id));
            await manager
                .getRepository(QuizQuestionEntity)
                .update(question.id, changes);
            await touchQuiz(manager, quizId);
        });
        return this.question(questionId);
    }
    async deleteQuestion(quizId, questionId) {
        await this.dataSource.transaction(async (manager) => {
            const quiz = await this.lockQuiz(manager, quizId);
            await lockQuestion(manager, questionId, quizId);
            assertDraft(quiz);
            await manager.getRepository(QuizQuestionEntity).delete(questionId);
            await renumber(manager, 'quiz_questions', 'quiz_id', quizId);
            await touchQuiz(manager, quizId);
        });
        return this.questions.listForInstructor(quizId);
    }
    async reorderQuestions(quizId, dto) {
        await this.dataSource.transaction(async (manager) => {
            assertDraft(await this.lockQuiz(manager, quizId));
            const ids = await childIds(manager, 'quiz_questions', 'quiz_id', quizId);
            await applyOrder(manager, 'quiz_questions', 'quiz_id', quizId, ids, dto);
            await touchQuiz(manager, quizId);
        });
        return this.questions.listForInstructor(quizId);
    }
    async createOption(questionId, dto) {
        await this.dataSource.transaction(async (manager) => {
            const question = await this.lockQuestionOf(manager, questionId);
            const [{ count, next }] = await manager.query(`SELECT count(*)::int AS count, coalesce(max(position), 0) + 1 AS next
         FROM quiz_options WHERE question_id = $1`, [questionId]);
            if (count >= MAX_OPTIONS_PER_QUESTION)
                throw new ConflictException(body(409, 'OPTION_LIMIT_REACHED'));
            const isCorrect = dto.isCorrect ?? false;
            if (isCorrect)
                await keepSingleCorrect(manager, question, null);
            const options = manager.getRepository(QuizOptionEntity);
            await options.insert(options.create({
                questionId,
                content: cleanHtml(dto.content, 'OPTION_CONTENT_REQUIRED'),
                isCorrect,
                position: next,
            }));
            await touchQuiz(manager, question.quizId);
        });
        return this.question(questionId);
    }
    async updateOption(optionId, dto) {
        const questionId = await this.dataSource.transaction(async (manager) => {
            const question = await this.lockQuestionOf(manager, await optionQuestionId(manager, optionId));
            const changes = {};
            if (dto.content !== undefined)
                changes.content = cleanHtml(dto.content, 'OPTION_CONTENT_REQUIRED');
            if (dto.isCorrect !== undefined)
                changes.isCorrect = dto.isCorrect;
            if (Object.keys(changes).length) {
                if (dto.isCorrect)
                    await keepSingleCorrect(manager, question, optionId);
                await manager.getRepository(QuizOptionEntity).update(optionId, changes);
                await touchQuiz(manager, question.quizId);
            }
            return question.id;
        });
        return this.question(questionId);
    }
    async deleteOption(optionId) {
        const questionId = await this.dataSource.transaction(async (manager) => {
            const question = await this.lockQuestionOf(manager, await optionQuestionId(manager, optionId));
            await manager.getRepository(QuizOptionEntity).delete(optionId);
            await renumber(manager, 'quiz_options', 'question_id', question.id);
            await touchQuiz(manager, question.quizId);
            return question.id;
        });
        return this.question(questionId);
    }
    async reorderOptions(questionId, dto) {
        await this.dataSource.transaction(async (manager) => {
            const question = await this.lockQuestionOf(manager, questionId);
            const ids = await childIds(manager, 'quiz_options', 'question_id', questionId);
            await applyOrder(manager, 'quiz_options', 'question_id', questionId, ids, dto);
            await touchQuiz(manager, question.quizId);
        });
        return this.question(questionId);
    }
    async validateQuizStructureForPublish(quizId, manager) {
        const questions = await (manager ?? this.dataSource.manager)
            .getRepository(QuizQuestionEntity)
            .find({
            where: { quizId },
            relations: { options: true },
            select: {
                id: true,
                type: true,
                points: true,
                position: true,
                options: { id: true, isCorrect: true },
            },
            order: { position: 'ASC', id: 'ASC' },
        });
        return validateQuizStructure(questions);
    }
    async lockQuiz(manager, quizId) {
        const quiz = await manager.getRepository(QuizEntity).findOne({
            where: { id: quizId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!quiz)
            throw new NotFoundException(QUIZ_NOT_FOUND);
        return quiz;
    }
    async lockQuestionOf(manager, questionId) {
        const [owner] = await manager.query('SELECT quiz_id AS "quizId" FROM quiz_questions WHERE id = $1', [questionId]);
        if (!owner)
            throw new NotFoundException(QUESTION_NOT_FOUND);
        const quiz = await this.lockQuiz(manager, owner.quizId);
        const question = await lockQuestion(manager, questionId, quiz.id);
        assertDraft(quiz);
        return question;
    }
    async question(questionId) {
        const question = await this.dataSource
            .getRepository(QuizQuestionEntity)
            .findOne({
            where: { id: questionId },
            relations: { options: true },
            order: { options: { position: 'ASC', id: 'ASC' } },
        });
        if (!question)
            throw new NotFoundException(QUESTION_NOT_FOUND);
        return InstructorQuestionResponseDto.from(question);
    }
};
QuizQuestionAuthoringService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizQuestionsService])
], QuizQuestionAuthoringService);
export { QuizQuestionAuthoringService };
function assertDraft(quiz) {
    if (quiz.status !== QuizStatus.DRAFT)
        throw quizNotEditable();
}
function assertCorrectCountFits(type, correct) {
    if (type === QuizQuestionType.SINGLE_CHOICE && correct > 1)
        throw badRequest('SINGLE_CHOICE_HAS_MULTIPLE_CORRECT');
}
async function lockQuestion(manager, questionId, quizId) {
    const [question] = await manager.query(`SELECT id, quiz_id AS "quizId", type FROM quiz_questions
     WHERE id = $1 AND quiz_id = $2 FOR UPDATE`, [questionId, quizId]);
    if (!question)
        throw new NotFoundException(QUESTION_NOT_FOUND);
    return question;
}
async function optionQuestionId(manager, optionId) {
    const [option] = await manager.query('SELECT question_id AS "questionId" FROM quiz_options WHERE id = $1', [optionId]);
    if (!option)
        throw new NotFoundException(OPTION_NOT_FOUND);
    return option.questionId;
}
async function correctCount(manager, questionId) {
    const [{ correct }] = await manager.query(`SELECT count(*)::int AS correct FROM quiz_options
     WHERE question_id = $1 AND is_correct`, [questionId]);
    return correct;
}
async function keepSingleCorrect(manager, question, exceptOptionId) {
    if (question.type !== QuizQuestionType.SINGLE_CHOICE)
        return;
    await manager.query(`UPDATE quiz_options SET is_correct = false
     WHERE question_id = $1 AND is_correct AND id IS DISTINCT FROM $2`, [question.id, exceptOptionId]);
}
const touchQuiz = (manager, quizId) => manager.query('UPDATE quizzes SET updated_at = now() WHERE id = $1', [
    quizId,
]);
async function childIds(manager, table, parent, parentId) {
    const rows = await manager.query(`SELECT id FROM ${table} WHERE ${parent} = $1 FOR UPDATE`, [parentId]);
    return rows.map(({ id }) => id);
}
function renumber(manager, table, parent, parentId) {
    return manager.query(`UPDATE ${table} target SET position = ordered.rank
     FROM (
       SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS rank
       FROM ${table} WHERE ${parent} = $1
     ) ordered
     WHERE target.id = ordered.id AND target.position <> ordered.rank`, [parentId]);
}
async function applyOrder(manager, table, parent, parentId, currentIds, { items }) {
    const requested = new Set(items.map(({ id }) => id));
    if (requested.size !== items.length ||
        requested.size !== currentIds.length ||
        !currentIds.every((id) => requested.has(id)))
        throw badRequest('REORDER_ITEMS_MISMATCH');
    if (new Set(items.map(({ position }) => position)).size !== items.length)
        throw badRequest('REORDER_DUPLICATE_POSITION');
    const ordered = [...items].sort((a, b) => a.position - b.position);
    await manager.query(`UPDATE ${table} target SET position = wanted.position
     FROM unnest($2::uuid[], $3::int[]) AS wanted(id, position)
     WHERE target.${parent} = $1 AND target.id = wanted.id
       AND target.position <> wanted.position`, [
        parentId,
        ordered.map(({ id }) => id),
        ordered.map((_, index) => index + 1),
    ]);
}
//# sourceMappingURL=quiz-question-authoring.service.js.map