import type { ImportLocation } from '../import-errors.js';

/** Where each part of a question came from, for located error messages. */
export type QuestionSource = {
  // The question as a whole: "Row 5", "Line 12", "questions[3]".
  at: ImportLocation;
  // Finer locations where the format has them (Excel columns, JSON paths).
  fields?: Partial<
    Record<
      'content' | 'type' | 'points' | 'correct' | 'options' | 'explanation',
      ImportLocation
    >
  >;
};

/**
 * One question as read from a file, before validation: values keep their raw
 * types so the shared validator reports wrong ones instead of the parser
 * guessing.
 */
export type ParsedQuestion = {
  content: unknown;
  type?: unknown;
  points?: unknown;
  explanation?: unknown;
  options: Array<{ content: unknown; isCorrect?: unknown }>;
  source: QuestionSource;
};

export type ParsedQuiz = {
  // Quiz settings found in the file (title, scope, slug, ...); unvalidated.
  settings: Record<string, unknown>;
  questions: ParsedQuestion[];
};

export type ParsedLesson = {
  title?: unknown;
  isPreview?: unknown;
  isRequired?: unknown;
  // Unsanitized HTML; the service sanitizes it before anything is stored.
  html: string;
};

export interface QuizFileParser {
  parseQuiz(buffer: Buffer): Promise<ParsedQuiz> | ParsedQuiz;
}

export interface LessonFileParser {
  parseLesson(buffer: Buffer): ParsedLesson;
}
