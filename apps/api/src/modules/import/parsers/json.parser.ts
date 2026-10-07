import {
  ImportValidationException,
  failImport,
  issueAt,
  type ImportIssue,
} from '../import-errors.js';
import { fileText } from '../import-file.js';
import type {
  LessonFileParser,
  ParsedLesson,
  ParsedQuestion,
  ParsedQuiz,
  QuizFileParser,
} from './import-parser.types.js';
import { markdownToUnsafeHtml } from './markdown-html.js';

const QUESTION_KEYS = new Set([
  'content',
  'type',
  'points',
  'explanation',
  'options',
]);
const OPTION_KEYS = new Set(['content', 'isCorrect']);
const LESSON_KEYS = new Set([
  'title',
  'isPreview',
  'isRequired',
  'textBody',
  'markdown',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseObject(buffer: Buffer) {
  let value: unknown;
  try {
    value = JSON.parse(fileText(buffer));
  } catch (error) {
    failImport({}, `Invalid JSON: ${(error as Error).message}`);
  }
  if (!isObject(value)) failImport({ path: '$' }, 'Expected a JSON object');
  return value as Record<string, unknown>;
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ImportIssue[],
) {
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      issues.push(issueAt({ path: `${path}.${key}` }, 'Unknown property'));
}

/**
 * Quiz JSON: the quiz settings at the top level (same names as the authoring
 * API) plus `questions: [{ content, type?, points?, explanation?,
 * options: [{ content, isCorrect? }] }]`.
 *
 * Lesson JSON: `{ title, textBody }` (HTML) or `{ title, markdown }`, plus
 * optional isPreview / isRequired.
 */
export class JsonParser implements QuizFileParser, LessonFileParser {
  parseQuiz(buffer: Buffer): ParsedQuiz {
    const { questions, ...settings } = parseObject(buffer);
    if (!Array.isArray(questions))
      failImport({ path: 'questions' }, 'Expected an array of questions');

    const issues: ImportIssue[] = [];
    const parsed: ParsedQuestion[] = [];
    (questions as unknown[]).forEach((question, index) => {
      const path = `questions[${index}]`;
      if (!isObject(question)) {
        issues.push(issueAt({ path }, 'Expected a question object'));
        return;
      }
      unknownKeys(question, QUESTION_KEYS, path, issues);
      const options = question.options ?? [];
      if (!Array.isArray(options)) {
        issues.push(
          issueAt({ path: `${path}.options` }, 'Expected an array of options'),
        );
        return;
      }
      parsed.push({
        content: question.content,
        type: question.type,
        points: question.points,
        explanation: question.explanation,
        options: options.map((option: unknown, optionIndex) => {
          const optionPath = `${path}.options[${optionIndex}]`;
          if (!isObject(option)) {
            issues.push(
              issueAt({ path: optionPath }, 'Expected an option object'),
            );
            return { content: undefined };
          }
          unknownKeys(option, OPTION_KEYS, optionPath, issues);
          return { content: option.content, isCorrect: option.isCorrect };
        }),
        source: {
          at: { path },
          fields: {
            content: { path: `${path}.content` },
            type: { path: `${path}.type` },
            points: { path: `${path}.points` },
            explanation: { path: `${path}.explanation` },
            options: { path: `${path}.options` },
            correct: { path: `${path}.options` },
          },
        },
      });
    });
    if (issues.length) throw new ImportValidationException(issues);
    return { settings, questions: parsed };
  }

  parseLesson(buffer: Buffer): ParsedLesson {
    const value = parseObject(buffer);
    const issues: ImportIssue[] = [];
    unknownKeys(value, LESSON_KEYS, '$', issues);
    const { textBody, markdown } = value;
    if ((textBody === undefined) === (markdown === undefined))
      issues.push(
        issueAt({ path: '$' }, 'Provide exactly one of textBody or markdown'),
      );
    for (const [key, body] of Object.entries({ textBody, markdown }))
      if (body !== undefined && typeof body !== 'string')
        issues.push(issueAt({ path: key }, 'Expected a string'));
    if (issues.length) throw new ImportValidationException(issues);

    return {
      title: value.title,
      isPreview: value.isPreview,
      isRequired: value.isRequired,
      html:
        typeof markdown === 'string'
          ? markdownToUnsafeHtml(markdown)
          : (textBody as string),
    };
  }
}
