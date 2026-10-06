import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';

// Required-if-present: rejects null for NOT NULL columns, unlike @IsOptional.
const present = (_object: object, value: unknown) => value !== undefined;

export const MAX_OPTIONS_PER_QUESTION = 50;
export const MAX_REORDER_ITEMS = 1000;

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

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  explanation?: string | null;
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

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  explanation?: string | null;

  // Optional quick-create; stored in the given order.
  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS_PER_QUESTION)
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];
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
