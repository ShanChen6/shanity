import { randomInt } from 'node:crypto';
export const QUIZ_SNAPSHOT_SCHEMA_VERSION = 1;
export const secureShuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};
const byPosition = (a, b) => a.position - b.position || a.id.localeCompare(b.id);
export function buildQuizSnapshot(quiz, courseId, questions, shuffle = secureShuffle) {
    const ordered = [...questions]
        .sort(byPosition)
        .map((question) => {
        const options = [...(question.options ?? [])]
            .sort(byPosition)
            .map(({ id, content, position, isCorrect }) => ({
            id,
            content,
            position,
            isCorrect,
        }));
        return {
            id: question.id,
            type: question.type,
            content: question.content,
            position: question.position,
            points: question.points,
            explanation: question.explanation,
            options: quiz.shuffleOptions ? shuffle(options) : options,
        };
    });
    return {
        schemaVersion: QUIZ_SNAPSHOT_SCHEMA_VERSION,
        quiz: {
            id: quiz.id,
            version: quiz.version,
            title: quiz.title,
            description: quiz.description,
            scope: quiz.scope,
            targetId: quiz.targetId,
            courseId,
            passingScore: quiz.passingScore,
            durationMinutes: quiz.durationMinutes,
            maxAttempts: quiz.maxAttempts,
            reviewPolicy: quiz.reviewPolicy,
            gradingPolicy: quiz.gradingPolicy,
        },
        questions: quiz.shuffleQuestions ? shuffle(ordered) : ordered,
    };
}
//# sourceMappingURL=quiz-attempt-snapshot.js.map