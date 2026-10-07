import { ForbiddenException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { sanitizeLessonHtml } from '../../../security/html-sanitizer.js';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { CreateLessonDto } from '../../lessons/dto/lessons.dto.js';
import { LessonType } from '../../lessons/entities/lesson.entity.js';
import { LessonsService } from '../../lessons/lessons.service.js';
import { QuizOptionEntity } from '../../quiz/entities/quiz-option.entity.js';
import { QuizQuestionEntity } from '../../quiz/entities/quiz-question.entity.js';
import {
  QuizAuthoringService,
  rethrowWriteError,
} from '../../quiz/services/quiz-authoring.service.js';
import { QuizQuestionAuthoringService } from '../../quiz/services/quiz-question-authoring.service.js';
import type { ImportLessonFormDto, ImportQuizFormDto } from '../import.dto.js';
import {
  ImportValidationException,
  issueAt,
  type ImportIssue,
} from '../import-errors.js';
import { detectImportFormat, type ImportFormat } from '../import-file.js';
import { ExcelParser } from '../parsers/excel.parser.js';
import type {
  LessonFileParser,
  QuizFileParser,
} from '../parsers/import-parser.types.js';
import { JsonParser } from '../parsers/json.parser.js';
import { MarkdownParser } from '../parsers/markdown.parser.js';
import {
  validateQuizImport,
  type ImportedQuestion,
} from './quiz-import.validator.js';

const LESSON_FORBIDDEN = 'You do not have permission to modify this lesson';
// Keeps every INSERT well under PostgreSQL's 65535 bind parameters.
const INSERT_CHUNK = 500;

const QUIZ_PARSERS: Record<ImportFormat, QuizFileParser> = {
  json: new JsonParser(),
  markdown: new MarkdownParser(),
  xlsx: new ExcelParser(),
};
const LESSON_PARSERS: Partial<Record<ImportFormat, LessonFileParser>> = {
  json: new JsonParser(),
  markdown: new MarkdownParser(),
};

/**
 * Creates lessons and quizzes from uploaded files. Each import goes through
 * the same doors as hand authoring: CreateLessonDto / CreateQuizDto /
 * CreateQuestionDto validation, sanitizeLessonHtml, the same ownership rules,
 * and the quiz publish quality gate. Everything lands as a DRAFT.
 */
@Injectable()
export class ContentImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly lessons: LessonsService,
    private readonly quizzes: QuizAuthoringService,
    private readonly questionAuthoring: QuizQuestionAuthoringService,
    private readonly curriculum: CurriculumEvents,
  ) {}

  async importLesson(
    principal: Principal,
    form: ImportLessonFormDto,
    file: Express.Multer.File | undefined,
  ) {
    const format = await detectImportFormat(file, ['json', 'markdown']);
    // Same rule as LessonOwnershipGuard, which cannot see multipart fields.
    const courseId = await this.lessonCourseFor(principal, form.chapterId);

    const parsed = LESSON_PARSERS[format]!.parseLesson(file!.buffer);
    const issues: ImportIssue[] = [];
    // Sanitized here, at the import boundary, before any validation or
    // storage; LessonsService sanitizes again when it builds the content.
    const textBody = sanitizeLessonHtml(parsed.html);
    if (!textBody)
      issues.push(
        issueAt(
          { path: 'body' },
          'Lesson body is empty after removing unsafe HTML',
        ),
      );
    const dto = plainToInstance(CreateLessonDto, {
      title: form.title ?? parsed.title,
      type: LessonType.TEXT,
      isPreview: parsed.isPreview,
      isRequired: parsed.isRequired,
      content: { textBody: textBody || undefined },
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const error of errors.flatMap((error) => [
      error,
      ...(error.children ?? []),
    ]))
      for (const message of Object.values(error.constraints ?? {}))
        issues.push(issueAt({ path: error.property }, message));
    if (issues.length) throw new ImportValidationException(issues);

    const lesson = await this.lessons.create(form.chapterId, dto, {
      draft: true,
    });
    this.curriculum.emitChanged({
      courseId,
      source: 'POST /admin/import/lesson',
    });
    return lesson;
  }

  async importQuiz(
    principal: Principal,
    form: ImportQuizFormDto,
    file: Express.Multer.File | undefined,
  ) {
    const format = await detectImportFormat(file, ['json', 'markdown', 'xlsx']);
    const parsed = await QUIZ_PARSERS[format].parseQuiz(file!.buffer);
    const { settings, questions } = validateQuizImport(parsed, form);

    const created = await this.dataSource
      .transaction(async (manager) => {
        // Binding + authority checks, exactly as POST /admin/quizzes.
        const quiz = await this.quizzes.insertDraft(
          manager,
          principal,
          settings,
        );
        await insertQuestions(manager, quiz.id, questions);
        // Final gate on what was actually written, in this transaction.
        const gate =
          await this.questionAuthoring.validateQuizStructureForPublish(
            quiz.id,
            manager,
          );
        if (!gate.valid)
          throw new ImportValidationException(
            gate.issues.map(({ code }) => issueAt({}, code)),
          );
        return quiz;
      })
      .catch(rethrowWriteError);
    return {
      ...(await this.quizzes.detail(created.id, created.courseId)),
      import: { format, questionCount: questions.length },
    };
  }

  private async lessonCourseFor(principal: Principal, chapterId: string) {
    const [row] = await this.dataSource.query<
      Array<{ courseId: string; instructorId: string | null }>
    >(
      `SELECT course.id AS "courseId", course.instructor_id AS "instructorId"
       FROM chapters chapter JOIN courses course ON course.id = chapter.course_id
       WHERE chapter.id = $1`,
      [chapterId],
    );
    // A missing chapter is indistinguishable from someone else's.
    if (
      !row ||
      !(
        principal.roles.includes('admin') ||
        (principal.roles.includes('instructor') &&
          row.instructorId === principal.id)
      )
    )
      throw new ForbiddenException(LESSON_FORBIDDEN);
    return row.courseId;
  }
}

async function insertQuestions(
  manager: EntityManager,
  quizId: string,
  questions: ImportedQuestion[],
) {
  const questionRepository = manager.getRepository(QuizQuestionEntity);
  const optionRepository = manager.getRepository(QuizOptionEntity);
  const options: QuizOptionEntity[] = [];

  for (let start = 0; start < questions.length; start += INSERT_CHUNK) {
    const chunk = questions.slice(start, start + INSERT_CHUNK);
    const { identifiers } = await questionRepository.insert(
      chunk.map((question, index) =>
        questionRepository.create({
          quizId,
          type: question.type,
          content: question.content,
          position: start + index + 1,
          points: question.points,
          explanation: question.explanation,
        }),
      ),
    );
    chunk.forEach((question, index) => {
      const questionId = identifiers[index]!.id as string;
      question.options.forEach((option, position) =>
        options.push(
          optionRepository.create({
            questionId,
            content: option.content,
            isCorrect: option.isCorrect,
            position: position + 1,
          }),
        ),
      );
    });
  }
  for (let start = 0; start < options.length; start += INSERT_CHUNK)
    await optionRepository.insert(options.slice(start, start + INSERT_CHUNK));
}
