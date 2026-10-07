export declare function isReviewAllowed(frozen: {
    reviewPolicy: string;
    maxAttempts: number | null;
}, attempt: {
    isPassed: boolean | null;
}, history: {
    attemptsUsed: number;
    hasOpenAttempt: boolean;
}): boolean;
