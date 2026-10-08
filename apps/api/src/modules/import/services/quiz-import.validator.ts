import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { sanitizeLessonHtml } from '../../../security/html-sanitizer.js';
import { CreateQuizDto } from '../../quiz/dto/quiz-authoring.dto.js';
import { CreateQuestionDto } from '../../quiz/dto/quiz-question-authoring.dto.js';
import { QuizQuestionType } from '../../quiz/entities/quiz-question.entity.js';
import { MAX_QUESTIONS_PER_QUIZ } from '../../quiz/services/quiz-question-authoring.service.js';
import {
  validateQuizStructure,
  type QuizStructureIssueCode,
} from '../../quiz/services/quiz-structure.js';
import {
  ImportValidationException,
  issueAt,
  type ImportIssue,
  type ImportLocation,
} from '../import-errors.js';
import type {
  ParsedQuestion,
  ParsedQuiz,
  QuestionSource,
} from '../parsers/import-parser.types.js';

export type ImportedQuestion = {
  type: QuizQuestionType;
  content: string;
  points: number;
  explanation: string | null;
  options: Array<{ content: string; isCorrect: boolean }>;
};

export type ValidatedQuizImport = {
  settings: CreateQuizDto;
  questions: ImportedQuestion[];
};

// Same options as the global ValidationPipe, so a file is held to exactly
// the rules of the JSON authoring API.
const VALIDATION = {
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
} as const;

const STRUCTURE_MESSAGES: Record<
  QuizStructureIssueCode,
  [keyof NonNullable<QuestionSource['fields']>, string]
> = {
  QUIZ_HAS_NO_QUESTIONS: ['content', 'The quiz has no questions'],
  QUESTION_NEEDS_TWO_OPTIONS: ['options', 'At least 2 options are required'],
  QUESTION_MISSING_CORRECT_OPTION: [
    'correct',
    'Missing correct answer: mark at least one option correct',
  ],
  SINGLE_CHOICE_HAS_MULTIPLE_CORRECT: [
    'correct',
    'SINGLE_CHOICE allows exactly one correct option',
  ],
  MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION: [
    'correct',
    'MULTIPLE_CHOICE needs at least one incorrect option',
  ],
  ESSAY_CONFIG_REQUIRED: ['type', 'ESSAY requires essayConfig'],
  ESSAY_OPTIONS_NOT_ALLOWED: ['options', 'ESSAY does not allow options'],
  INVALID_QUESTION_POINTS: ['points', 'Points must be greater than 0'],
};

/**
 * The format-independent half of a quiz import: settings through
 * CreateQuizDto, every question through CreateQuestionDto, HTML sanitized,
 * then the publish quality gate (validateQuizStructure). Collects every
 * problem with its file location and throws one 422, or returns clean data.
 */
export function validateQuizImport(
  parsed: ParsedQuiz,
  overrides: object,
): ValidatedQuizImport {
  const issues: ImportIssue[] = [];

  const settings = plainToInstance(CreateQuizDto, {
    ...parsed.settings,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  });
  for (const error of validateSync(settings, VALIDATION))
    issues.push(...located(error, () => ({ path: error.property })));

  if (!parsed.questions.length)
    issues.push(issueAt({}, 'The file contains no questions'));
  if (parsed.questions.length > MAX_QUESTIONS_PER_QUIZ)
    issues.push(
      issueAt(
        {},
        `At most ${MAX_QUESTIONS_PER_QUIZ} questions can be imported at once`,
      ),
    );

  // Questions that passed the DTO stage still go through the quality gate,
  // so one upload reports both kinds of problems.
  const checked = parsed.questions.flatMap((question, index) => {
    const clean = validateQuestion(question, issues);
    return clean ? [{ ...clean, id: String(index) }] : [];
  });
  for (const { code, questionId } of validateQuizStructure(checked).issues) {
    if (questionId === undefined) continue; // no questions: reported above
    const source = parsed.questions[Number(questionId)]!.source;
    const [field, message] = STRUCTURE_MESSAGES[code];
    issues.push(issueAt(source.fields?.[field] ?? source.at, message));
  }
  const questions: ImportedQuestion[] = checked.map(
    ({ id: _index, ...question }) => question,
  );

  if (issues.length) throw new ImportValidationException(issues);
  return { settings, questions };
}

function validateQuestion(
  question: ParsedQuestion,
  issues: ImportIssue[],
): ImportedQuestion | undefined {
  const { source } = question;
  const before = issues.length;
  const dto = plainToInstance(CreateQuestionDto, {
    content: question.content,
    type: question.type,
    points: question.points,
    explanation: question.explanation,
    options: question.options,
  });
  for (const error of validateSync(dto, VALIDATION))
    issues.push(
      ...located(error, (child) =>
        locate(source, error.property as FieldName, child),
      ),
    );
  if (issues.length > before) return undefined;

  // Stored like authored questions: sanitized, and never blank afterwards.
  const content = sanitizeLessonHtml(dto.content);
  if (!content)
    issues.push(
      issueAt(
        locate(source, 'content'),
        'Question content is empty after removing unsafe HTML',
      ),
    );
  const options = (dto.options ?? []).map((option, index) => {
    const clean = sanitizeLessonHtml(option.content);
    if (!clean)
      issues.push(
        issueAt(
          locate(source, 'options', index),
          'Option content is empty after removing unsafe HTML',
        ),
      );
    return { content: clean, isCorrect: option.isCorrect ?? false };
  });
  if (issues.length > before) return undefined;

  return {
    type: dto.type ?? QuizQuestionType.SINGLE_CHOICE,
    content,
    points: dto.points ?? 10,
    explanation:
      dto.explanation === undefined || dto.explanation === null
        ? null
        : sanitizeLessonHtml(dto.explanation) || null,
    options,
  };
}

type FieldName = keyof NonNullable<QuestionSource['fields']>;

/** A question field's location; for options, which one ("option 3"). */
function locate(
  source: QuestionSource,
  field: FieldName,
  optionIndex?: number,
): ImportLocation {
  const base = source.fields?.[field] ?? source.at;
  if (optionIndex === undefined) return base;
  if (base.path) return { ...base, path: `${base.path}[${optionIndex}]` };
  return { ...base, path: `option ${optionIndex + 1}` };
}

/** Flattens a class-validator error tree into located issues. */
function located(
  error: ValidationError,
  where: (childIndex?: number) => ImportLocation,
  childIndex?: number,
): ImportIssue[] {
  const own = Object.values(error.constraints ?? {}).map((message) =>
    issueAt(where(childIndex), message),
  );
  const nested = (error.children ?? []).flatMap((child) => {
    const index = Number(child.property);
    return located(child, where, Number.isInteger(index) ? index : childIndex);
  });
  return [...own, ...nested];
}
