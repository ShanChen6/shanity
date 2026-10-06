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
    const score = totalPoints > 0 ? Math.floor((earnedPoints * 100) / totalPoints + 0.5) : 0;
    return {
        answers,
        earnedPoints,
        totalPoints,
        score,
        isPassed: score >= snapshot.quiz.passingScore,
    };
}
//# sourceMappingURL=quiz-grading.js.map