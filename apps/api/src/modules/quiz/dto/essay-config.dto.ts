import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  EssaySubmissionType,
  type EssayConfig,
  type EssayRubricCriterion,
} from '../domain/assessment.types.js';

const present = (_object: object, value: unknown) => value !== undefined;

export class RubricCriterionDto implements EssayRubricCriterion {
  @IsString({ message: 'criterion must be a string' })
  @IsNotEmpty({ message: 'criterion must not be empty' })
  @MaxLength(500, { message: 'criterion must not exceed 500 characters' })
  criterion!: string;

  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: 'maxPoints must be a number with at most 2 decimal places' },
  )
  @Min(0.25, { message: 'maxPoints must be at least 0.25' })
  @Max(32767, { message: 'maxPoints must not exceed 32767' })
  maxPoints!: number;

  @ValidateIf(present)
  @IsString({ message: 'description must be a string' })
  @MaxLength(2000, {
    message: 'description must not exceed 2000 characters',
  })
  description?: string;
}

export class EssayConfigDto implements EssayConfig {
  @IsArray({ message: 'allowedSubmissionTypes must be an array' })
  @ArrayMinSize(1, {
    message: 'allowedSubmissionTypes must contain at least one item',
  })
  @ArrayUnique({
    message: 'allowedSubmissionTypes must not contain duplicate values',
  })
  @IsEnum(EssaySubmissionType, {
    each: true,
    message:
      'each allowedSubmissionTypes value must be TEXT_WITH_KATEX or FILE_UPLOAD',
  })
  allowedSubmissionTypes!: EssaySubmissionType[];

  @ValidateIf(present)
  @IsInt({ message: 'maxFileUploads must be an integer' })
  @Min(1, { message: 'maxFileUploads must be at least 1' })
  @Max(10, { message: 'maxFileUploads must not exceed 10' })
  maxFileUploads = 3;

  @ValidateIf(present)
  @IsInt({ message: 'maxWords must be an integer' })
  @Min(1, { message: 'maxWords must be at least 1' })
  maxWords?: number;

  @ValidateIf(present)
  @IsString({ message: 'gradingGuide must be a string' })
  @IsNotEmpty({ message: 'gradingGuide must not be empty' })
  @MaxLength(20000, {
    message: 'gradingGuide must not exceed 20000 characters',
  })
  gradingGuide?: string;

  @ValidateIf(present)
  @IsArray({ message: 'rubric must be an array' })
  @ArrayMinSize(1, {
    message: 'rubric must contain at least one criterion when provided',
  })
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  rubric?: RubricCriterionDto[];

  /** @deprecated Accepted for E2 clients; services persist it as `rubric`. */
  @ValidateIf(present)
  @IsArray({ message: 'gradingRubric must be an array' })
  @ArrayMinSize(1, {
    message: 'gradingRubric must contain at least one criterion when provided',
  })
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  gradingRubric?: RubricCriterionDto[];
}

export { EssaySubmissionType };
