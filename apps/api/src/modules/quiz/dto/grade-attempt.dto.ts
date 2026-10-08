import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const present = (_object: object, value: unknown) => value !== undefined;
const decimals2 = {
  allowNaN: false,
  allowInfinity: false,
  maxDecimalPlaces: 2,
};

/** One rubric criterion of the frozen snapshot, by its index in the rubric. */
export class RubricScoreDto {
  @IsInt()
  @Min(0)
  criterionIndex!: number;

  @IsNumber(decimals2)
  @Min(0)
  score!: number;
}

/**
 * The instructor's grade for one essay question. The maximum is NOT part of
 * the payload: the service reads it from the attempt's frozen question, so a
 * tampered client cannot raise its own ceiling.
 */
export class GradeEssayQuestionDto {
  @IsUUID()
  questionId!: string;

  @IsNumber(decimals2)
  @Min(0)
  awardedPoints!: number;

  @ValidateIf(present)
  @IsString()
  @MaxLength(10_000)
  feedback?: string;

  // When sent, the criteria must add up to `awardedPoints`.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RubricScoreDto)
  rubricScores?: RubricScoreDto[];
}

/** POST /instructor/quiz-attempts/:attemptId/grade */
export class GradeQuizAttemptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GradeEssayQuestionDto)
  grades!: GradeEssayQuestionDto[];

  // Why already-given grades change. Required once the result is published.
  @ValidateIf(present)
  @IsString()
  @MaxLength(2000)
  adjustmentReason?: string;
}
