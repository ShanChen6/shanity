import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  Allow,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import type { QuizAttemptSnapshot } from '../services/quiz-attempt-snapshot.js';
import { LearnerQuestionResponseDto } from './quiz-question-response.dto.js';
import type { EssayAnswer } from '../domain/assessment.types.js';
import { isScoreConcealed, learnerStatus } from '../services/quiz-attempt-state.js';

const present = (_object: object, value: unknown) => value !== undefined;

export class EssayAttachmentDto {
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'attachment url must be a valid HTTPS URL' },
  )
  @MaxLength(2048)
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size!: number;
}

@ValidatorConstraint({ name: 'essayAnswerHasContent' })
class EssayAnswerHasContent implements ValidatorConstraintInterface {
  validate(_value: unknown, { object }: ValidationArguments) {
    const answer = object as EssayAnswerDto;
    return Boolean(
      answer.text?.trim() ||
      (Array.isArray(answer.attachments) && answer.attachments.length > 0),
    );
  }

  defaultMessage() {
    return 'essayAnswer must contain non-empty text or at least one attachment';
  }
}

export class EssayAnswerDto implements EssayAnswer {
  @ValidateIf(present)
  @IsString()
  @MaxLength(100_000)
  text?: string;

  @ValidateIf(present)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EssayAttachmentDto)
  attachments?: EssayAttachmentDto[];

  @Validate(EssayAnswerHasContent)
  private readonly content?: never;
}

@ValidatorConstraint({ name: 'submitAnswerHasOneResponse' })
class SubmitAnswerHasOneResponse implements ValidatorConstraintInterface {
  validate(_value: unknown, { object }: ValidationArguments) {
    const dto = object as SubmitAnswerDto;
    const hasEssay = dto.essayAnswer !== undefined;
    const hasSingle = dto.selectedOptionId !== undefined;
    const hasMany = dto.selectedOptionIds !== undefined;
    if (hasEssay) return !hasSingle && !hasMany;
    if (hasSingle === hasMany) return false;
    return (
      hasSingle ||
      (Array.isArray(dto.selectedOptionIds) && dto.selectedOptionIds.length > 0)
    );
  }

  defaultMessage() {
    return 'answer must contain either selected option IDs or essayAnswer, but not both';
  }
}

export class SubmitAnswerDto {
  @IsUUID()
  questionId!: string;

  @ValidateIf(
    (dto: SubmitAnswerDto) =>
      dto.selectedOptionIds === undefined && dto.essayAnswer === undefined,
  )
  @IsUUID()
  selectedOptionId?: string;

  @ValidateIf((dto: SubmitAnswerDto) => dto.selectedOptionIds !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds?: string[];

  @ValidateIf((dto: SubmitAnswerDto) => dto.essayAnswer !== undefined)
  @IsDefined()
  @ValidateNested()
  @Type(() => EssayAnswerDto)
  essayAnswer?: EssayAnswerDto;

  @Validate(SubmitAnswerHasOneResponse)
  private readonly responseShape?: never;
}

export class SubmitQuizDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers?: SubmitAnswerDto[];

  // Explicitly accepted and ignored: all scoring remains server-authoritative.
  @Allow()
  score?: unknown;

  @Allow()
  isPassed?: unknown;

  @Allow()
  earnedPoints?: unknown;

  @Allow()
  totalPoints?: unknown;

  @Allow()
  percentage?: unknown;
}

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
      dto.essayAnswer === undefined &&
      (dto.selectedOptionIds === undefined ||
        dto.selectedOptionId !== undefined),
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

  @ValidateIf((dto: SaveAttemptAnswerDto) => dto.essayAnswer !== undefined)
  @ValidateNested()
  @Type(() => EssayAnswerDto)
  essayAnswer?: EssayAnswerDto;
}

/** A draft essay may be partial or empty (the learner cleared it). */
export class EssayDraftDto {
  @ValidateIf(present)
  @IsString()
  @MaxLength(100_000)
  text?: string;

  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EssayAttachmentDto)
  attachments?: EssayAttachmentDto[];
}

/**
 * PATCH /quiz-attempts/:id/answers/draft. Either `selectedOptionIds` (MCQ,
 * [] clears) or `essayAnswer` (essay, {} clears). Nothing is graded.
 */
export class SaveDraftAnswerDto {
  @IsUUID()
  questionId!: string;

  @ValidateIf((dto: SaveDraftAnswerDto) => dto.essayAnswer === undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds?: string[];

  @ValidateIf((dto: SaveDraftAnswerDto) => dto.essayAnswer !== undefined)
  @ValidateNested()
  @Type(() => EssayDraftDto)
  essayAnswer?: EssayDraftDto;
}

export type SavedAnswerRow = {
  questionId: string;
  selectedOptionIds: string[];
  essayAnswer?: EssayAnswer;
  savedAt: Date;
};

export class LearnerAttemptAnswerResponseDto {
  questionId: string;
  // The one selected option; null when none or several are selected.
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  essayAnswer: EssayAnswer | null;
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
      ...(answer.essayAnswer && { essayAnswer: answer.essayAnswer }),
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
    const concealed = isScoreConcealed(attempt.status);
    return Object.assign(new LearnerAttemptResponseDto(), {
      id: attempt.id,
      quizId: attempt.quizId,
      attemptNumber: attempt.attemptNumber,
      status: learnerStatus(attempt.status),
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      // Withheld while essays await grading (score concealment).
      score: concealed ? null : attempt.score,
      isPassed: concealed ? null : attempt.isPassed,
      earnedPoints: concealed ? null : attempt.earnedPoints,
      totalPoints: concealed ? null : attempt.totalPoints,
      percentage: concealed ? null : attempt.percentage,
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
