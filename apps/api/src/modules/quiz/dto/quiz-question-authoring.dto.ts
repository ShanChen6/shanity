import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDefined,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { EssayConfigDto } from './essay-config.dto.js';

// Required-if-present: rejects null for NOT NULL columns, unlike @IsOptional.
const present = (_object: object, value: unknown) => value !== undefined;

export const MAX_OPTIONS_PER_QUESTION = 50;
export const MAX_REORDER_ITEMS = 1000;

@ValidatorConstraint({ name: 'multipleChoiceHasEnoughOptions' })
class MultipleChoiceHasEnoughOptions implements ValidatorConstraintInterface {
  validate(value: unknown, { object }: ValidationArguments) {
    const dto = object as CreateQuestionDto;
    return (
      dto.type !== QuizQuestionType.MULTIPLE_CHOICE ||
      (Array.isArray(value) && value.length >= 2)
    );
  }

  defaultMessage() {
    return 'options must contain at least 2 items for MULTIPLE_CHOICE questions';
  }
}

type RubricQuestionDto = {
  type?: QuizQuestionType;
  points?: number;
  maxScore?: number;
  essayConfig?: EssayConfigDto;
};

const configuredRubric = (config?: EssayConfigDto) =>
  config?.rubric ?? config?.gradingRubric;

const rubricTotal = (config?: EssayConfigDto) =>
  configuredRubric(config)?.reduce(
    (total, criterion) => total + criterion.maxPoints,
    0,
  );

export function rubricTotalMismatchMessage(
  config: EssayConfigDto | undefined,
  maxScore: number,
) {
  return `Total points of rubric criteria (${rubricTotal(config)}) must equal question max score (${maxScore})`;
}

@ValidatorConstraint({ name: 'rubricTotalMatchingMaxScore' })
class RubricTotalMatchingMaxScore implements ValidatorConstraintInterface {
  validate(_value: unknown, { object }: ValidationArguments) {
    const dto = object as RubricQuestionDto;
    if (
      dto.type !== QuizQuestionType.ESSAY ||
      !configuredRubric(dto.essayConfig)
    )
      return true;
    // An update without a score needs the persisted score, so the service
    // enforces the same invariant after locking the question row.
    const maxScore = dto.maxScore ?? dto.points;
    if (maxScore === undefined && object instanceof UpdateQuestionDto)
      return true;
    const expected = maxScore ?? 10;
    const actual = rubricTotal(dto.essayConfig);
    return (
      actual === undefined ||
      !Number.isFinite(actual) ||
      Math.abs(actual - expected) < 1e-9
    );
  }

  defaultMessage({ object }: ValidationArguments) {
    const dto = object as RubricQuestionDto;
    return rubricTotalMismatchMessage(
      dto.essayConfig,
      dto.maxScore ?? dto.points ?? 10,
    );
  }
}

export function IsRubricTotalMatchingMaxScore(
  validationOptions?: ValidationOptions,
) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: RubricTotalMatchingMaxScore,
    });
}

export class CreateOptionDto {
  // HTML is sanitized server-side before it is stored.
  @IsString()
  @MaxLength(2000)
  content!: string;

  @ValidateIf(present)
  @IsBoolean()
  isCorrect?: boolean;
}

export class UpdateOptionDto {
  @ValidateIf(present)
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ValidateIf(present)
  @IsBoolean()
  isCorrect?: boolean;
}

export class UpdateQuestionDto {
  @ValidateIf(present)
  @IsString()
  @MaxLength(20000)
  content?: string;

  @ValidateIf(present)
  @IsEnum(QuizQuestionType)
  type?: QuizQuestionType;

  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(32767)
  points?: number;

  /** API alias for the entity's existing `points` column. */
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(32767)
  maxScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  explanation?: string | null;

  // Partial updates validate the config when supplied. Changing to ESSAY in a
  // single request requires it; existing option rows are checked by service.
  @ValidateIf(
    (dto: UpdateQuestionDto) =>
      dto.type === QuizQuestionType.ESSAY || dto.essayConfig !== undefined,
  )
  @IsDefined({ message: 'essayConfig is required when type is ESSAY' })
  @ValidateNested()
  @Type(() => EssayConfigDto)
  @IsRubricTotalMatchingMaxScore()
  essayConfig?: EssayConfigDto;
}

export class CreateQuestionDto {
  @IsString()
  @MaxLength(20000)
  content!: string;

  // Defaults to SINGLE_CHOICE.
  @ValidateIf(present)
  @IsEnum(QuizQuestionType)
  type?: QuizQuestionType;

  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(32767)
  points?: number;

  /** API alias for the entity's existing `points` column. */
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(32767)
  maxScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  explanation?: string | null;

  // MULTIPLE_CHOICE is atomic on create. SINGLE_CHOICE keeps Sprint 7's
  // incremental authoring behavior and may add options through child routes.
  @ValidateIf(
    (dto: CreateQuestionDto) =>
      dto.type === QuizQuestionType.MULTIPLE_CHOICE ||
      dto.options !== undefined,
  )
  @IsDefined({ message: 'options are required for MULTIPLE_CHOICE questions' })
  @IsArray({ message: 'options must be an array' })
  @Validate(MultipleChoiceHasEnoughOptions)
  @ArrayMaxSize(MAX_OPTIONS_PER_QUESTION)
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];

  @ValidateIf(
    (dto: CreateQuestionDto) =>
      dto.type === QuizQuestionType.ESSAY || dto.essayConfig !== undefined,
  )
  @IsDefined({ message: 'essayConfig is required when type is ESSAY' })
  @ValidateNested()
  @Type(() => EssayConfigDto)
  @IsRubricTotalMatchingMaxScore()
  essayConfig?: EssayConfigDto;
}

export class ReorderItemDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(1)
  @Max(32767)
  position!: number;
}

/**
 * The complete new order: every question (or option) exactly once. Positions
 * must be distinct; they are normalized to 1..n.
 */
export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

export class ReorderQuestionsDto extends ReorderDto {}
export class ReorderOptionsDto extends ReorderDto {}
