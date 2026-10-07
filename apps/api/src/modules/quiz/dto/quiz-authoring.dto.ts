import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  GradingPolicy,
  QuizDifficulty,
  QuizScope,
  QuizStatus,
  ReviewPolicy,
} from '../entities/quiz.entity.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// Required-if-present: rejects null for NOT NULL columns, unlike @IsOptional.
const present = (_object: object, value: unknown) => value !== undefined;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Trimmed, lowercased and de-duplicated before validation.
const normalizeTags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.map((tag) =>
            typeof tag === 'string' ? tag.trim().toLowerCase() : tag,
          ),
        ),
      ]
    : value;
const TAG = /^[\p{L}\p{N}][\p{L}\p{N} +#.-]*$/u;

/**
 * Editable quiz settings. Only declared properties pass the global whitelist
 * ValidationPipe; system fields (status, version, createdBy, ...) are not
 * declared anywhere and are rejected with 400.
 */
abstract class QuizSettingsDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  @Matches(SLUG, { message: 'slug must be lowercase words joined by hyphens' })
  slug?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf(present)
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  // null = unlimited.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32767)
  maxAttempts?: number | null;

  // null = untimed.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  durationMinutes?: number | null;

  @ValidateIf(present)
  @IsBoolean()
  isRequired?: boolean;

  @ValidateIf(present)
  @IsEnum(ReviewPolicy)
  reviewPolicy?: ReviewPolicy;

  @ValidateIf(present)
  @IsEnum(GradingPolicy)
  gradingPolicy?: GradingPolicy;

  @ValidateIf(present)
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ValidateIf(present)
  @IsBoolean()
  shuffleOptions?: boolean;

  // Discovery metadata; null clears the difficulty.
  @IsOptional()
  @IsEnum(QuizDifficulty)
  difficulty?: QuizDifficulty | null;

  @ValidateIf(present)
  @Transform(normalizeTags)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  @Matches(TAG, {
    each: true,
    message: 'tags are letters, digits, spaces and + # . -',
  })
  tags?: string[];
}

// Partial update: omitted properties keep their value. No scope/targetId.
export class UpdateQuizDto extends QuizSettingsDto {
  @ValidateIf(present)
  @Transform(trimString)
  @IsString()
  @Length(3, 255)
  title?: string;
}

/** Binding is chosen once, here; it is immutable afterwards. */
export class CreateQuizDto extends QuizSettingsDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 255)
  title!: string;

  @IsEnum(QuizScope)
  scope!: QuizScope;

  // Required for contextual scopes, null for STANDALONE: the scope/target
  // matrix itself is enforced by QuizTargetValidationService.
  @IsOptional()
  @IsUUID()
  targetId?: string | null;
}

export class ListQuizzesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(QuizScope)
  scope?: QuizScope;

  // Archived quizzes are hidden unless asked for explicitly.
  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}
