import { QuizQuestionType } from '../entities/quiz-question.entity.js';

export type QuizStructureIssueCode =
  | 'QUIZ_HAS_NO_QUESTIONS'
  | 'QUESTION_NEEDS_TWO_OPTIONS'
  | 'QUESTION_MISSING_CORRECT_OPTION'
  | 'SINGLE_CHOICE_HAS_MULTIPLE_CORRECT'
  | 'MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION'
  | 'INVALID_QUESTION_POINTS';

export type QuizStructureIssue = {
  code: QuizStructureIssueCode;
  questionId?: string;
};

export type QuizStructureQuestion = {
  id: string;
  type: QuizQuestionType;
  points: number;
  options: Array<{ isCorrect: boolean }>;
};

/**
 * Publish-readiness of a choice quiz's questions. Reports every problem at
 * once, in checklist order per question, so an author can fix them in one
 * pass; `valid` is true only with no issues.
 *
 * - at least one question;
 * - every question has at least two options;
 * - SINGLE_CHOICE: exactly one correct option;
 * - MULTIPLE_CHOICE: at least one correct and at least one incorrect option;
 * - every question is worth more than zero points.
 */
export function validateQuizStructure(questions: QuizStructureQuestion[]) {
  const issues: QuizStructureIssue[] = [];
  if (!questions.length) issues.push({ code: 'QUIZ_HAS_NO_QUESTIONS' });
  for (const question of questions) {
    const issue = (code: QuizStructureIssueCode) =>
      issues.push({ code, questionId: question.id });
    const correct = question.options.filter((option) => option.isCorrect);
    if (question.options.length < 2) issue('QUESTION_NEEDS_TWO_OPTIONS');
    if (!correct.length) issue('QUESTION_MISSING_CORRECT_OPTION');
    if (question.type === QuizQuestionType.SINGLE_CHOICE && correct.length > 1)
      issue('SINGLE_CHOICE_HAS_MULTIPLE_CORRECT');
    if (
      question.type === QuizQuestionType.MULTIPLE_CHOICE &&
      correct.length === question.options.length &&
      question.options.length > 0
    )
      issue('MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION');
    if (!Number.isInteger(question.points) || question.points <= 0)
      issue('INVALID_QUESTION_POINTS');
  }
  return { valid: issues.length === 0, issues };
}
