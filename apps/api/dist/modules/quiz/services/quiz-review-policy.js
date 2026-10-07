import { ReviewPolicy } from '../entities/quiz.entity.js';
export function isReviewAllowed(frozen, attempt, history) {
    switch (frozen.reviewPolicy) {
        case ReviewPolicy.AFTER_SUBMIT:
        case 'ALWAYS':
            return true;
        case ReviewPolicy.AFTER_PASS:
            return attempt.isPassed === true;
        case ReviewPolicy.AFTER_EXHAUSTED:
            return (frozen.maxAttempts !== null &&
                history.attemptsUsed >= frozen.maxAttempts &&
                !history.hasOpenAttempt);
        default:
            return false;
    }
}
//# sourceMappingURL=quiz-review-policy.js.map