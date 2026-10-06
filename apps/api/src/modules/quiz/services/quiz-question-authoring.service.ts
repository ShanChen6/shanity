import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { sanitizeLessonHtml } from '../../../security/html-sanitizer.js';
import { InstructorQuestionResponseDto } from '../dto/quiz-question-response.dto.js';
import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_REORDER_ITEMS,
  type CreateOptionDto,
  type CreateQuestionDto,
  type ReorderDto,
  type UpdateOptionDto,
  type UpdateQuestionDto,
} from '../dto/quiz-question-authoring.dto.js';
import { QuizEntity, QuizStatus } from '../entities/quiz.entity.js';
import { QuizOptionEntity } from '../entities/quiz-option.entity.js';
import {
  QuizQuestionEntity,
  QuizQuestionType,
} from '../entities/quiz-question.entity.js';
import { quizNotEditable } from './quiz-authoring.service.js';
import { QUIZ_NOT_FOUND } from './quiz-learner-access.service.js';
import { QuizQuestionsService } from './quiz-questions.service.js';
import { validateQuizStructure } from './quiz-structure.js';

export const MAX_QUESTIONS_PER_QUIZ = MAX_REORDER_ITEMS;

const body = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});
const badRequest = (code: string) => new BadRequestException(body(400, code));
const QUESTION_NOT_FOUND = body(404, 'QUESTION_NOT_FOUND');
const OPTION_NOT_FOUND = body(404, 'OPTION_NOT_FOUND');

type LockedQuestion = { id: string; quizId: string; type: QuizQuestionType };

/** Stored HTML is sanitized like lesson bodies; it must not end up blank. */
function cleanHtml(value: string, code: string) {
  const clean = sanitizeLessonHtml(value);
  if (!clean) throw badRequest(code);
  return clean;
}

const cleanExplanation = (value: string | null | undefined) =>
  value === undefined || value === null
    ? value
    : sanitizeLessonHtml(value) || null;

/**
 * Question and option authoring inside the Quiz aggregate, behind
 * QuizAuthorizationGuard. Every mutation locks the quiz row first
 * (serializing edits and a later publish), verifies the child belongs to it,
 * and only then requires DRAFT. Positions are kept contiguous from 1.
 */
@Injectable()
export class QuizQuestionAuthoringService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly questions: QuizQuestionsService,
  ) {}

  async createQuestion(quizId: string, dto: CreateQuestionDto) {
    const id = await this.dataSource.transaction(async (manager) => {
      assertDraft(await this.lockQuiz(manager, quizId));

      const type = dto.type ?? QuizQuestionType.SINGLE_CHOICE;
      const options = (dto.options ?? []).map((option: CreateOptionDto) => ({
        content: cleanHtml(option.content, 'OPTION_CONTENT_REQUIRED'),
        isCorrect: option.isCorrect ?? false,
      }));
      assertCorrectCountFits(
        type,
        options.filter((option) => option.isCorrect).length,
      );
      const [{ count, next }] = await manager.query<
        Array<{ count: number; next: number }>
      >(
        `SELECT count(*)::int AS count, coalesce(max(position), 0) + 1 AS next
         FROM quiz_questions WHERE quiz_id = $1`,
        [quizId],
      );
      if (count >= MAX_QUESTIONS_PER_QUIZ)
        throw new ConflictException(body(409, 'QUESTION_LIMIT_REACHED'));

      const questions = manager.getRepository(QuizQuestionEntity);
      const { identifiers } = await questions.insert(
        questions.create({
          quizId,
          type,
          content: cleanHtml(dto.content, 'QUESTION_CONTENT_REQUIRED'),
          position: next,
          points: dto.points ?? 10,
          explanation: cleanExplanation(dto.explanation) ?? null,
        }),
      );
      const questionId = identifiers[0]!.id as string;
      if (options.length) {
        const repository = manager.getRepository(QuizOptionEntity);
        await repository.insert(
          options.map((option, index) =>
            repository.create({
              questionId,
              content: option.content,
              isCorrect: option.isCorrect,
              position: index + 1,
            }),
          ),
        );
      }
      await touchQuiz(manager, quizId);
      return questionId;
    });
    return this.question(id);
  }

  async updateQuestion(
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDto,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const quiz = await this.lockQuiz(manager, quizId);
      const question = await lockQuestion(manager, questionId, quizId);
      assertDraft(quiz);

      const changes: QueryDeepPartialEntity<QuizQuestionEntity> = {};
      if (dto.content !== undefined)
        changes.content = cleanHtml(dto.content, 'QUESTION_CONTENT_REQUIRED');
      if (dto.type !== undefined) changes.type = dto.type;
      if (dto.points !== undefined) changes.points = dto.points;
      if (dto.explanation !== undefined)
        changes.explanation = cleanExplanation(dto.explanation);
      if (!Object.keys(changes).length) return;

      if (dto.type === QuizQuestionType.SINGLE_CHOICE)
        assertCorrectCountFits(
          dto.type,
          await correctCount(manager, question.id),
        );
      await manager
        .getRepository(QuizQuestionEntity)
        .update(question.id, changes);
      await touchQuiz(manager, quizId);
    });
    return this.question(questionId);
  }

  /** Options cascade; later questions move up. Returns the remaining list. */
  async deleteQuestion(quizId: string, questionId: string) {
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

  async reorderQuestions(quizId: string, dto: ReorderDto) {
    await this.dataSource.transaction(async (manager) => {
      assertDraft(await this.lockQuiz(manager, quizId));
      const ids = await childIds(manager, 'quiz_questions', 'quiz_id', quizId);
      await applyOrder(manager, 'quiz_questions', 'quiz_id', quizId, ids, dto);
      await touchQuiz(manager, quizId);
    });
    return this.questions.listForInstructor(quizId);
  }

  async createOption(questionId: string, dto: CreateOptionDto) {
    await this.dataSource.transaction(async (manager) => {
      const question = await this.lockQuestionOf(manager, questionId);
      const [{ count, next }] = await manager.query<
        Array<{ count: number; next: number }>
      >(
        `SELECT count(*)::int AS count, coalesce(max(position), 0) + 1 AS next
         FROM quiz_options WHERE question_id = $1`,
        [questionId],
      );
      if (count >= MAX_OPTIONS_PER_QUESTION)
        throw new ConflictException(body(409, 'OPTION_LIMIT_REACHED'));

      const isCorrect = dto.isCorrect ?? false;
      if (isCorrect) await keepSingleCorrect(manager, question, null);
      const options = manager.getRepository(QuizOptionEntity);
      await options.insert(
        options.create({
          questionId,
          content: cleanHtml(dto.content, 'OPTION_CONTENT_REQUIRED'),
          isCorrect,
          position: next,
        }),
      );
      await touchQuiz(manager, question.quizId);
    });
    return this.question(questionId);
  }

  async updateOption(optionId: string, dto: UpdateOptionDto) {
    const questionId = await this.dataSource.transaction(async (manager) => {
      const question = await this.lockQuestionOf(
        manager,
        await optionQuestionId(manager, optionId),
      );

      const changes: QueryDeepPartialEntity<QuizOptionEntity> = {};
      if (dto.content !== undefined)
        changes.content = cleanHtml(dto.content, 'OPTION_CONTENT_REQUIRED');
      if (dto.isCorrect !== undefined) changes.isCorrect = dto.isCorrect;
      if (Object.keys(changes).length) {
        if (dto.isCorrect) await keepSingleCorrect(manager, question, optionId);
        await manager.getRepository(QuizOptionEntity).update(optionId, changes);
        await touchQuiz(manager, question.quizId);
      }
      return question.id;
    });
    return this.question(questionId);
  }

  /** Later options move up. Returns the parent question. */
  async deleteOption(optionId: string) {
    const questionId = await this.dataSource.transaction(async (manager) => {
      const question = await this.lockQuestionOf(
        manager,
        await optionQuestionId(manager, optionId),
      );
      await manager.getRepository(QuizOptionEntity).delete(optionId);
      await renumber(manager, 'quiz_options', 'question_id', question.id);
      await touchQuiz(manager, question.quizId);
      return question.id;
    });
    return this.question(questionId);
  }

  async reorderOptions(questionId: string, dto: ReorderDto) {
    await this.dataSource.transaction(async (manager) => {
      const question = await this.lockQuestionOf(manager, questionId);
      const ids = await childIds(
        manager,
        'quiz_options',
        'question_id',
        questionId,
      );
      await applyOrder(
        manager,
        'quiz_options',
        'question_id',
        questionId,
        ids,
        dto,
      );
      await touchQuiz(manager, question.quizId);
    });
    return this.question(questionId);
  }

  /**
   * Publish-readiness of the quiz's current questions (for the publishing
   * workflow): pass the publish transaction's manager to check what it locks.
   */
  async validateQuizStructureForPublish(
    quizId: string,
    manager?: EntityManager,
  ) {
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

  /**
   * Locks the aggregate. Authority was settled by QuizAuthorizationGuard; a
   * 404 here only means the quiz was deleted after the guard ran.
   */
  private async lockQuiz(manager: EntityManager, quizId: string) {
    const quiz = await manager.getRepository(QuizEntity).findOne({
      where: { id: quizId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!quiz) throw new NotFoundException(QUIZ_NOT_FOUND);
    return quiz;
  }

  /** For question-addressed routes: question -> its quiz (locked) -> DRAFT. */
  private async lockQuestionOf(manager: EntityManager, questionId: string) {
    const [owner] = await manager.query<Array<{ quizId: string }>>(
      'SELECT quiz_id AS "quizId" FROM quiz_questions WHERE id = $1',
      [questionId],
    );
    if (!owner) throw new NotFoundException(QUESTION_NOT_FOUND);
    const quiz = await this.lockQuiz(manager, owner.quizId);
    // Re-read under the quiz lock: it may have been deleted meanwhile.
    const question = await lockQuestion(manager, questionId, quiz.id);
    assertDraft(quiz);
    return question;
  }

  private async question(questionId: string) {
    const question = await this.dataSource
      .getRepository(QuizQuestionEntity)
      .findOne({
        where: { id: questionId },
        relations: { options: true },
        order: { options: { position: 'ASC', id: 'ASC' } },
      });
    if (!question) throw new NotFoundException(QUESTION_NOT_FOUND);
    return InstructorQuestionResponseDto.from(question);
  }
}

function assertDraft(quiz: QuizEntity) {
  if (quiz.status !== QuizStatus.DRAFT) throw quizNotEditable();
}

function assertCorrectCountFits(type: QuizQuestionType, correct: number) {
  if (type === QuizQuestionType.SINGLE_CHOICE && correct > 1)
    throw badRequest('SINGLE_CHOICE_HAS_MULTIPLE_CORRECT');
}

/** The question must belong to the quiz; a foreign id is simply not found. */
async function lockQuestion(
  manager: EntityManager,
  questionId: string,
  quizId: string,
): Promise<LockedQuestion> {
  const [question] = await manager.query<LockedQuestion[]>(
    `SELECT id, quiz_id AS "quizId", type FROM quiz_questions
     WHERE id = $1 AND quiz_id = $2 FOR UPDATE`,
    [questionId, quizId],
  );
  if (!question) throw new NotFoundException(QUESTION_NOT_FOUND);
  return question;
}

async function optionQuestionId(manager: EntityManager, optionId: string) {
  const [option] = await manager.query<Array<{ questionId: string }>>(
    'SELECT question_id AS "questionId" FROM quiz_options WHERE id = $1',
    [optionId],
  );
  if (!option) throw new NotFoundException(OPTION_NOT_FOUND);
  return option.questionId;
}

async function correctCount(manager: EntityManager, questionId: string) {
  const [{ correct }] = await manager.query<Array<{ correct: number }>>(
    `SELECT count(*)::int AS correct FROM quiz_options
     WHERE question_id = $1 AND is_correct`,
    [questionId],
  );
  return correct;
}

/**
 * Radio semantics: marking an option correct on a SINGLE_CHOICE question
 * clears the previous correct one, so switching the key is a single call.
 */
async function keepSingleCorrect(
  manager: EntityManager,
  question: LockedQuestion,
  exceptOptionId: string | null,
) {
  if (question.type !== QuizQuestionType.SINGLE_CHOICE) return;
  await manager.query(
    `UPDATE quiz_options SET is_correct = false
     WHERE question_id = $1 AND is_correct AND id IS DISTINCT FROM $2`,
    [question.id, exceptOptionId],
  );
}

const touchQuiz = (manager: EntityManager, quizId: string) =>
  manager.query('UPDATE quizzes SET updated_at = now() WHERE id = $1', [
    quizId,
  ]);

// Identifiers below come only from these literal unions, never from input.
type ChildTable = 'quiz_questions' | 'quiz_options';
type ParentColumn = 'quiz_id' | 'question_id';

async function childIds(
  manager: EntityManager,
  table: ChildTable,
  parent: ParentColumn,
  parentId: string,
) {
  const rows = await manager.query<Array<{ id: string }>>(
    `SELECT id FROM ${table} WHERE ${parent} = $1 FOR UPDATE`,
    [parentId],
  );
  return rows.map(({ id }) => id);
}

/** Closes gaps: positions become 1..n in their current order. */
function renumber(
  manager: EntityManager,
  table: ChildTable,
  parent: ParentColumn,
  parentId: string,
) {
  return manager.query(
    `UPDATE ${table} target SET position = ordered.rank
     FROM (
       SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS rank
       FROM ${table} WHERE ${parent} = $1
     ) ordered
     WHERE target.id = ordered.id AND target.position <> ordered.rank`,
    [parentId],
  );
}

/**
 * Applies a complete new order: the items must name every child exactly once
 * with distinct positions; positions are then normalized to 1..n.
 */
async function applyOrder(
  manager: EntityManager,
  table: ChildTable,
  parent: ParentColumn,
  parentId: string,
  currentIds: string[],
  { items }: ReorderDto,
) {
  const requested = new Set(items.map(({ id }) => id));
  if (
    requested.size !== items.length ||
    requested.size !== currentIds.length ||
    !currentIds.every((id) => requested.has(id))
  )
    throw badRequest('REORDER_ITEMS_MISMATCH');
  if (new Set(items.map(({ position }) => position)).size !== items.length)
    throw badRequest('REORDER_DUPLICATE_POSITION');

  const ordered = [...items].sort((a, b) => a.position - b.position);
  await manager.query(
    `UPDATE ${table} target SET position = wanted.position
     FROM unnest($2::uuid[], $3::int[]) AS wanted(id, position)
     WHERE target.${parent} = $1 AND target.id = wanted.id
       AND target.position <> wanted.position`,
    [
      parentId,
      ordered.map(({ id }) => id),
      ordered.map((_, index) => index + 1),
    ],
  );
}
