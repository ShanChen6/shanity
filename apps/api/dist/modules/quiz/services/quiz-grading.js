export function gradeAttempt(snapshot, saved) {
    const selections = new Map(saved.map((answer) => [
        answer.questionId,
        new Set(answer.selectedOptionIds),
    ]));
    const answers = snapshot.questions.map((question) => {
        const selected = selections.get(question.id) ?? new Set();
        const correct = question.options.filter((option) => option.isCorrect);
        const isCorrect = correct.length > 0 &&
            selected.size === correct.length &&
            correct.every((option) => selected.has(option.id));
        return {
            questionId: question.id,
            isCorrect,
            pointsEarned: isCorrect ? question.points : 0,
        };
    });
    const totalPoints = snapshot.questions.reduce((sum, question) => sum + question.points, 0);
    const earnedPoints = answers.reduce((sum, answer) => sum + answer.pointsEarned, 0);
    const hundredths = percentHundredths(earnedPoints, totalPoints);
    const percentage = hundredths / 100;
    return {
        answers,
        earnedPoints,
        totalPoints,
        percentage,
        score: Math.floor(hundredths / 100),
        isPassed: hundredths >= snapshot.quiz.passingScore * 100,
    };
}
function percentHundredths(earned, total) {
    if (total <= 0)
        return 0;
    return Math.floor((2 * earned * 10_000 + total) / (2 * total));
}
//# sourceMappingURL=quiz-grading.js.map