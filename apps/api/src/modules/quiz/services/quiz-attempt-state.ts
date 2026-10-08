import { BadRequestException } from '@nestjs/common';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';

const {
  IN_PROGRESS,
  SUBMITTING,
  NEEDS_GRADING,
  GRADED,
  COMPLETED,
  TIMED_OUT,
  ABANDONED,
  SUBMITTED,
} = QuizAttemptStatus;

/**
 * The attempt lifecycle. SUBMITTING is the internal "SUBMITTED" claim: it is
 * committed while exactly one request grades, so retries never grade twice.
 *
 *   IN_PROGRESS -> SUBMITTING -> COMPLETED      (pure MCQ: graded and published)
 *                             -> NEEDS_GRADING  (has essays, MCQ auto-graded)
 *   IN_PROGRESS -> TIMED_OUT | NEEDS_GRADING    (deadline passed)
 *   NEEDS_GRADING -> GRADED                     (last essay graded; private)
 *   GRADED -> COMPLETED                         (instructor published results)
 *
 * GRADED is not COMPLETED: the final score exists but the learner may not see
 * it. COMPLETED means "published" (`published_at` is set). Everything else is
 * terminal: no way back to IN_PROGRESS, and no skipping the publication step.
 */
const TRANSITIONS: Record<QuizAttemptStatus, readonly QuizAttemptStatus[]> = {
  [IN_PROGRESS]: [SUBMITTING, TIMED_OUT, NEEDS_GRADING, ABANDONED],
  [SUBMITTING]: [COMPLETED, NEEDS_GRADING, TIMED_OUT],
  [NEEDS_GRADING]: [GRADED],
  [GRADED]: [COMPLETED],
  [COMPLETED]: [],
  [TIMED_OUT]: [],
  [ABANDONED]: [],
  [SUBMITTED]: [],
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
 * Score concealment: until the result is published (COMPLETED), the learner
 * sees no score, percentage, pass/fail, feedback or answer key, not even the
 * auto-graded MCQ part or a finished essay grade.
 */
export const isScoreConcealed = (status: QuizAttemptStatus) =>
  status === NEEDS_GRADING || status === GRADED;

/**
 * What the learner is told. GRADED is an instructor-side state: to the
 * learner it is still "waiting", so the status never hints that grading has
 * finished.
 */
export const learnerStatus = (status: QuizAttemptStatus) =>
  status === GRADED ? NEEDS_GRADING : status;

export const PENDING_REVIEW_MESSAGE =
  'Your submission is pending instructor review for essay questions.';
export const PENDING_PUBLICATION_MESSAGE =
  'Submitted. Waiting for instructor to publish results.';

/** The notice shown in place of the result. */
export const concealedMessage = (status: QuizAttemptStatus) =>
  status === GRADED ? PENDING_PUBLICATION_MESSAGE : PENDING_REVIEW_MESSAGE;
