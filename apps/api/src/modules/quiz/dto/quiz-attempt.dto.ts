import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import type { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import type { QuizAttemptSnapshot } from '../services/quiz-attempt-snapshot.js';
import { LearnerQuestionResponseDto } from './quiz-question-response.dto.js';

export class SaveAttemptAnswerDto {
  @IsUUID()
  questionId!: string;

  // One id for SINGLE_CHOICE, several for MULTIPLE_CHOICE, [] clears.
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds!: string[];
}

export type SavedAnswerRow = {
  questionId: string;
  selectedOptionIds: string[];
  savedAt: Date;
};

export class LearnerAttemptAnswerResponseDto {
  questionId: string;
  selectedOptionIds: string[];
  savedAt: Date;

  static from(answer: SavedAnswerRow): LearnerAttemptAnswerResponseDto {
    return Object.assign(new LearnerAttemptAnswerResponseDto(), {
      questionId: answer.questionId,
      selectedOptionIds: answer.selectedOptionIds,
      savedAt: answer.savedAt,
    });
  }
}

export type AttemptSource = {
  id: string;
  quizId: string;
  attemptNumber: number;
  status: QuizAttemptStatus;
  quizSnapshot: QuizAttemptSnapshot;
  startedAt: Date;
  expiresAt: Date | null;
  submittedAt: Date | null;
  score: number | null;
  isPassed: boolean | null;
  serverNow: Date;
};

/**
 * A learner's attempt. While IN_PROGRESS it carries the frozen questions in
 * this attempt's order (answer key and explanations stripped) plus the saved
 * answers, so any device can restore the exact UI state. Once closed it is a
 * summary only; detailed review is governed by the review policy.
 */
export class LearnerAttemptResponseDto {
  id: string;
  quizId: string;
  attemptNumber: number;
  status: QuizAttemptStatus;
  startedAt: Date;
  expiresAt: Date | null;
  submittedAt: Date | null;
  score: number | null;
  isPassed: boolean | null;
  // Database clock, so clients can run a countdown without trusting theirs.
  serverNow: Date;
  quiz?: {
    title: string;
    description: string | null;
    durationMinutes: number | null;
    passingScore: number;
    questions: LearnerQuestionResponseDto[];
  };
  answers?: LearnerAttemptAnswerResponseDto[];

  static from(
    attempt: AttemptSource,
    answers: SavedAnswerRow[] | null,
  ): LearnerAttemptResponseDto {
    const { quiz, questions } = attempt.quizSnapshot;
    return Object.assign(new LearnerAttemptResponseDto(), {
      id: attempt.id,
      quizId: attempt.quizId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      isPassed: attempt.isPassed,
      serverNow: attempt.serverNow,
      ...(answers && {
        quiz: {
          title: quiz.title,
          description: quiz.description,
          durationMinutes: quiz.durationMinutes,
          passingScore: quiz.passingScore,
          questions: questions.map((question) =>
            LearnerQuestionResponseDto.from(question),
          ),
        },
        answers: answers.map((answer) =>
          LearnerAttemptAnswerResponseDto.from(answer),
        ),
      }),
    });
  }
}
