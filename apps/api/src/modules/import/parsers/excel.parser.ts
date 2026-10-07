import ExcelJS from 'exceljs';
import { QuizQuestionType } from '../../quiz/entities/quiz-question.entity.js';
import { MAX_QUESTIONS_PER_QUIZ } from '../../quiz/services/quiz-question-authoring.service.js';
import {
  ImportValidationException,
  failImport,
  issueAt,
  type ImportIssue,
} from '../import-errors.js';
import type {
  ParsedQuestion,
  ParsedQuiz,
  QuizFileParser,
} from './import-parser.types.js';
import { assertXlsxArchiveWithinLimits } from './xlsx-archive-guard.js';

/** Sheet layout; row 1 is a header and is never read as a question. */
export const EXCEL_COLUMNS = {
  content: 'A',
  type: 'B',
  points: 'C',
  correct: 'D',
  options: ['E', 'F', 'G', 'H'],
  explanation: 'I',
} as const;
const OPTION_RANGE = 'E-H';
const ALL_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const DEFAULT_POINTS = 10;

/**
 * Quiz questions from the first worksheet of an .xlsx workbook:
 *
 *   A content (required) | B type (SINGLE_CHOICE default) | C points (10)
 *   D correct option number(s): "2", or "1,3" for MULTIPLE_CHOICE
 *   E..H options 1..4 | I explanation (optional)
 *
 * Blank rows are skipped. Every cell problem is reported with its row and
 * column; the rules shared by all formats then run in the import validator.
 * Quiz settings (title, scope, ...) come from the request, not the sheet.
 */
export class ExcelParser implements QuizFileParser {
  async parseQuiz(buffer: Buffer): Promise<ParsedQuiz> {
    // Before exceljs inflates anything: bounded uncompressed size.
    assertXlsxArchiveWithinLimits(buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      failImport({}, 'The file is not a readable .xlsx workbook');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) failImport({}, 'The workbook has no worksheet');
    // rowCount includes trailing formatted-but-empty rows; bound it anyway so
    // a crafted sheet cannot make us walk millions of rows.
    if (sheet!.rowCount > MAX_QUESTIONS_PER_QUIZ * 5 + 1)
      failImport(
        {},
        `The sheet has too many rows (at most ${MAX_QUESTIONS_PER_QUIZ} questions)`,
      );

    const issues: ImportIssue[] = [];
    const questions: ParsedQuestion[] = [];
    for (let row = 2; row <= sheet!.rowCount; row++) {
      const cells = sheet!.getRow(row);
      const text = (column: string) => cellText(cells.getCell(column));
      if (ALL_COLUMNS.every((column) => !text(column))) continue;
      const question = parseRow(row, text, issues);
      if (question) questions.push(question);
    }
    if (issues.length) throw new ImportValidationException(issues);
    return { settings: {}, questions };
  }
}

function parseRow(
  row: number,
  text: (column: string) => string,
  issues: ImportIssue[],
): ParsedQuestion | undefined {
  const at = (column: string, message: string) =>
    issues.push(issueAt({ row, column }, message));
  const before = issues.length;

  const content = text(EXCEL_COLUMNS.content);
  if (!content) at(EXCEL_COLUMNS.content, 'Missing question content');

  const rawType = text(EXCEL_COLUMNS.type)
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const type = rawType
    ? (rawType as QuizQuestionType)
    : QuizQuestionType.SINGLE_CHOICE;
  if (!Object.values(QuizQuestionType).includes(type))
    at(
      EXCEL_COLUMNS.type,
      `Invalid question type "${text(EXCEL_COLUMNS.type)}"; use SINGLE_CHOICE or MULTIPLE_CHOICE`,
    );

  const rawPoints = text(EXCEL_COLUMNS.points);
  const points = rawPoints ? Number(rawPoints) : DEFAULT_POINTS;
  if (!Number.isInteger(points) || points <= 0)
    at(
      EXCEL_COLUMNS.points,
      `Points must be a whole number greater than 0, got "${rawPoints}"`,
    );

  // Options keep their column number, so "3" always means column G.
  const options = EXCEL_COLUMNS.options
    .map((column, index) => ({ number: index + 1, content: text(column) }))
    .filter((option) => option.content);
  if (options.length < 2)
    issues.push(
      issueAt({ row, column: OPTION_RANGE }, 'At least 2 options are required'),
    );

  const rawCorrect = text(EXCEL_COLUMNS.correct);
  const correct = new Set<number>();
  if (!rawCorrect) at(EXCEL_COLUMNS.correct, 'Missing correct answer index');
  else
    for (const part of rawCorrect.split(/[,;\s]+/).filter(Boolean)) {
      const number = Number(part);
      if (!Number.isInteger(number) || number < 1 || number > 4)
        at(
          EXCEL_COLUMNS.correct,
          `Correct answer index "${part}" must be a number from 1 to 4`,
        );
      else if (!options.some((option) => option.number === number))
        at(
          EXCEL_COLUMNS.correct,
          `Correct answer index ${number} points to an empty option (Column ${EXCEL_COLUMNS.options[number - 1]})`,
        );
      else correct.add(number);
    }
  if (type === QuizQuestionType.SINGLE_CHOICE && correct.size > 1)
    at(
      EXCEL_COLUMNS.correct,
      'SINGLE_CHOICE allows exactly one correct answer index',
    );

  if (issues.length > before) return undefined;
  return {
    content,
    type,
    points,
    explanation: text(EXCEL_COLUMNS.explanation) || undefined,
    options: options.map((option) => ({
      content: option.content,
      isCorrect: correct.has(option.number),
    })),
    source: {
      at: { row },
      fields: {
        content: { row, column: EXCEL_COLUMNS.content },
        type: { row, column: EXCEL_COLUMNS.type },
        points: { row, column: EXCEL_COLUMNS.points },
        correct: { row, column: EXCEL_COLUMNS.correct },
        options: { row, column: OPTION_RANGE },
        explanation: { row, column: EXCEL_COLUMNS.explanation },
      },
    },
  };
}

/** Display text of any cell kind (rich text, formula result, number, link). */
function cellText(cell: ExcelJS.Cell) {
  const { value } = cell;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'formula' in value) {
    const { result } = value;
    // Error results ({ error: '#REF!' }) count as empty cells.
    return typeof result === 'object' || result === undefined
      ? ''
      : String(result).trim();
  }
  return (cell.text ?? '').trim();
}
