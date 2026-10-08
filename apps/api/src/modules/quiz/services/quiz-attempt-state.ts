import { BadRequestException } from '@nestjs/common';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';

const { IN_PROGRESS, SUBMITTING, NEEDS_GRADING, COMPLETED, TIMED_OUT } =
  QuizAttemptStatus;

/**
 * The attempt lifecycle. SUBMITTING is the internal "SUBMITTED" claim: it is
 * committed while exactly one request grades, so retries never grade twice.
 *
 *   IN_PROGRESS -> SUBMITTING -> COMPLETED      (pure MCQ, graded at once)
 *                             -> NEEDS_GRADING  (has essays, MCQ auto-graded)
 *   IN_PROGRESS -> TIMED_OUT | NEEDS_GRADING    (deadline passed)
 *   NEEDS_GRADING -> COMPLETED                  (instructor finished grading)
 *
 * Everything else is terminal (COMPLETED, TIMED_OUT, ABANDONED, and the
 * legacy SUBMITTED): no way back to IN_PROGRESS.
 */
const TRANSITIONS: Record<QuizAttemptStatus, readonly QuizAttemptStatus[]> = {
  [IN_PROGRESS]: [
    SUBMITTING,
    TIMED_OUT,
    NEEDS_GRADING,
    QuizAttemptStatus.ABANDONED,
  ],
  [SUBMITTING]: [COMPLETED, NEEDS_GRADING, TIMED_OUT],
  [NEEDS_GRADING]: [COMPLETED],
  [COMPLETED]: [],
  [TIMED_OUT]: [],
  [QuizAttemptStatus.ABANDONED]: [],
  [QuizAttemptStatus.SUBMITTED]: [],
};

export const canTransition = (from: QuizAttemptStatus, to: QuizAttemptStatus) =>
  TRANSITIONS[from].includes(to);

export function assertTransition(
  from: QuizAttemptStatus,
  to: QuizAttemptStatus,
) {
  if (!canTransition(from, to))
    throw new BadRequestException({
      statusCode: 400,
      message: `Cannot move an attempt from ${from} to ${to}`,
      code: 'INVALID_STATE_TRANSITION',
    });
}

/**
 * Score concealment: while essays await the instructor, the learner must see
 * no score, percentage or pass/fail, not even the auto-graded MCQ part.
 */
export const isScoreConcealed = (status: QuizAttemptStatus) =>
  status === NEEDS_GRADING;

export const PENDING_REVIEW_MESSAGE =
  'Your submission is pending instructor review for essay questions.';
