import { ReviewPolicy } from '../entities/quiz.entity.js';

/**
 * Whether a closed attempt may disclose its answer key, per-question
 * correctness and explanations. Decided only by the policy frozen into the
 * attempt's snapshot, so later versions never change what an old attempt
 * reveals:
 *
 * - NEVER: never;
 * - AFTER_SUBMIT: as soon as it is graded (`ALWAYS` in older snapshots);
 * - AFTER_PASS: only when this attempt passed;
 * - AFTER_EXHAUSTED: once the frozen attempt limit is used up and no attempt
 *   is still open.
 */
export function isReviewAllowed(
  frozen: { reviewPolicy: string; maxAttempts: number | null },
  attempt: { isPassed: boolean | null },
  history: { attemptsUsed: number; hasOpenAttempt: boolean },
): boolean {
  switch (frozen.reviewPolicy) {
    case ReviewPolicy.AFTER_SUBMIT:
    case 'ALWAYS':
      return true;
    case ReviewPolicy.AFTER_PASS:
      return attempt.isPassed === true;
    case ReviewPolicy.AFTER_EXHAUSTED:
      return (
        frozen.maxAttempts !== null &&
        history.attemptsUsed >= frozen.maxAttempts &&
        !history.hasOpenAttempt
      );
    default:
      // NEVER, and any policy this build does not know: fail closed.
      return false;
  }
}
