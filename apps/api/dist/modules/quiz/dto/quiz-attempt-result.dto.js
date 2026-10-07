export class ResultOptionDto {
    id;
    content;
    isCorrect;
}
export class ResultQuestionDto {
    id;
    type;
    content;
    points;
    selectedOptionId;
    selectedOptionIds;
    isCorrect;
    pointsEarned;
    explanation;
    options;
}
export class AttemptResultDto {
    attemptId;
    quizId;
    quizTitle;
    status;
    notice;
    score;
    attemptInfo;
    reviewPolicy;
    reviewAllowed;
    questions;
}
export function buildAttemptResult(attempt, answers, reviewAllowed) {
    const { quiz, questions } = attempt.quizSnapshot;
    const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    return Object.assign(new AttemptResultDto(), {
        attemptId: attempt.id,
        quizId: attempt.quizId,
        quizTitle: quiz.title,
        status: attempt.status,
        ...(attempt.status === 'TIMED_OUT' && {
            notice: 'ATTEMPT_TIMED_OUT',
        }),
        score: {
            earnedPoints: attempt.earnedPoints,
            totalPoints: attempt.totalPoints,
            percentage: attempt.percentage,
            passingScore: quiz.passingScore,
            passed: attempt.isPassed,
        },
        attemptInfo: {
            currentAttempt: attempt.attemptNumber,
            maxAttempts: quiz.maxAttempts,
            startedAt: attempt.startedAt,
            submittedAt: attempt.submittedAt,
        },
        reviewPolicy: quiz.reviewPolicy === 'ALWAYS'
            ? 'AFTER_SUBMIT'
            : quiz.reviewPolicy,
        reviewAllowed,
        questions: questions.map((question) => {
            const answer = byQuestion.get(question.id);
            const selected = answer?.selectedOptionIds ?? [];
            return Object.assign(new ResultQuestionDto(), {
                id: question.id,
                type: question.type,
                content: question.content,
                points: question.points,
                selectedOptionId: selected.length === 1 ? selected[0] : null,
                selectedOptionIds: selected,
                isCorrect: reviewAllowed ? (answer?.isCorrect ?? false) : null,
                pointsEarned: reviewAllowed ? (answer?.pointsEarned ?? 0) : null,
                explanation: reviewAllowed ? question.explanation : null,
                options: question.options.map((option) => Object.assign(new ResultOptionDto(), {
                    id: option.id,
                    content: option.content,
                    ...(reviewAllowed && { isCorrect: option.isCorrect }),
                })),
            });
        }),
    });
}
//# sourceMappingURL=quiz-attempt-result.dto.js.map