import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// Multipart sends every field as a string: an empty one means "not given".
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && !value.trim() ? undefined : value;

/** Multipart fields next to the lesson file. */
export class ImportLessonFormDto {
  @IsUUID('4')
  chapterId!: string;

  // Overrides the title found in the file.
  @IsOptional()
  @Transform(blankToUndefined)
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  title?: string;
}

/**
 * Multipart fields next to the quiz file. They override the settings found
 * in a JSON/Markdown file and are the only settings an .xlsx sheet has; the
 * merged settings are then validated as a CreateQuizDto.
 */
export class ImportQuizFormDto {
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(32)
  scope?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(20000)
  description?: string;
}
