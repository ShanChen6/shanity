export class LearnerOptionResponseDto {
    id;
    content;
    position;
    static from(option) {
        return Object.assign(new LearnerOptionResponseDto(), {
            id: option.id,
            content: option.content,
            position: option.position,
        });
    }
}
export class LearnerQuestionResponseDto {
    id;
    type;
    content;
    position;
    points;
    options;
    static from(question) {
        return Object.assign(new LearnerQuestionResponseDto(), {
            id: question.id,
            type: question.type,
            content: question.content,
            position: question.position,
            points: question.points,
            options: question.options.map((option) => LearnerOptionResponseDto.from(option)),
        });
    }
}
export class LearnerQuizResponseDto {
    id;
    title;
    description;
    durationMinutes;
    passingScore;
    questions;
    static from(quiz, questions) {
        return Object.assign(new LearnerQuizResponseDto(), {
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            durationMinutes: quiz.durationMinutes,
            passingScore: quiz.passingScore,
            questions: questions.map((question) => LearnerQuestionResponseDto.from(question)),
        });
    }
}
export class InstructorOptionResponseDto {
    id;
    content;
    position;
    isCorrect;
    createdAt;
    static from(option) {
        return Object.assign(new InstructorOptionResponseDto(), {
            id: option.id,
            content: option.content,
            position: option.position,
            isCorrect: option.isCorrect,
            createdAt: option.createdAt,
        });
    }
}
export class InstructorQuestionResponseDto {
    id;
    quizId;
    type;
    content;
    position;
    points;
    explanation;
    createdAt;
    updatedAt;
    options;
    static from(question) {
        return Object.assign(new InstructorQuestionResponseDto(), {
            id: question.id,
            quizId: question.quizId,
            type: question.type,
            content: question.content,
            position: question.position,
            points: question.points,
            explanation: question.explanation,
            createdAt: question.createdAt,
            updatedAt: question.updatedAt,
            options: (question.options ?? []).map((option) => InstructorOptionResponseDto.from(option)),
        });
    }
}
//# sourceMappingURL=quiz-question-response.dto.js.map