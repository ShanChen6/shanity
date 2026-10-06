import { QuizQuestionType } from '../entities/quiz-question.entity.js';
export function validateQuizStructure(questions) {
    const issues = [];
    if (!questions.length)
        issues.push({ code: 'QUIZ_HAS_NO_QUESTIONS' });
    for (const question of questions) {
        const issue = (code) => issues.push({ code, questionId: question.id });
        const correct = question.options.filter((option) => option.isCorrect);
        if (question.options.length < 2)
            issue('QUESTION_NEEDS_TWO_OPTIONS');
        if (!correct.length)
            issue('QUESTION_MISSING_CORRECT_OPTION');
        if (question.type === QuizQuestionType.SINGLE_CHOICE && correct.length > 1)
            issue('SINGLE_CHOICE_HAS_MULTIPLE_CORRECT');
        if (question.type === QuizQuestionType.MULTIPLE_CHOICE &&
            correct.length === question.options.length &&
            question.options.length > 0)
            issue('MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION');
        if (!Number.isInteger(question.points) || question.points <= 0)
            issue('INVALID_QUESTION_POINTS');
    }
    return { valid: issues.length === 0, issues };
}
//# sourceMappingURL=quiz-structure.js.map