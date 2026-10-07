import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import type { QuizAttemptSnapshot } from '../services/quiz-attempt-snapshot.js';
import { LearnerQuestionResponseDto } from './quiz-question-response.dto.js';

/**
 * Exactly one of `selectedOptionId` (one option) or `selectedOptionIds` (one
 * id for SINGLE_CHOICE, several for MULTIPLE_CHOICE, [] clears). Both must
 * exist in this question of the attempt's snapshot.
 */
export class SaveAttemptAnswerDto {
  @IsUUID()
  questionId!: string;

  @ValidateIf(
    (dto: SaveAttemptAnswerDto) =>
      dto.selectedOptionIds === undefined || dto.selectedOptionId !== undefined,
  )
  @IsUUID()
  selectedOptionId?: string;

  @ValidateIf(
    (dto: SaveAttemptAnswerDto) => dto.selectedOptionIds !== undefined,
  )
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds?: string[];
}

export type SavedAnswerRow = {
  questionId: string;
  selectedOptionIds: string[];
  savedAt: Date;
};

export class LearnerAttemptAnswerResponseDto {
  questionId: string;
  // The one selected option; null when none or several are selected.
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  // Database clock at the save, never the client's.
  savedAt: Date;

  static from(answer: SavedAnswerRow): LearnerAttemptAnswerResponseDto {
    return Object.assign(new LearnerAttemptAnswerResponseDto(), {
      questionId: answer.questionId,
      selectedOptionId:
        answer.selectedOptionIds.length === 1
          ? answer.selectedOptionIds[0]
          : null,
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
  earnedPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
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
  earnedPoints: number | null;
  totalPoints: number | null;
  // 0..100 with 2 decimals; null until graded.
  percentage: number | null;
  // Set when the deadline closed the attempt: auto-submitted, not by the user.
  notice?: 'ATTEMPT_TIMED_OUT';
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
      earnedPoints: attempt.earnedPoints,
      totalPoints: attempt.totalPoints,
      percentage: attempt.percentage,
      ...(attempt.status === QuizAttemptStatus.TIMED_OUT && {
        notice: 'ATTEMPT_TIMED_OUT' as const,
      }),
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
