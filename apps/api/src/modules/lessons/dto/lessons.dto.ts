import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LessonType } from '../entities/lesson.entity.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LessonContentDto {
  @IsOptional()
  @IsString()
  @Length(1, 1_000_000)
  textBody?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  videoAssetId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  documentAssetId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  documentFileName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  documentFileSize?: number;

  @IsOptional()
  @IsBoolean()
  documentDownloadAllowed?: boolean;
}

export class CreateLessonDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title!: string;

  @IsEnum(LessonType)
  type!: LessonType;

  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @IsObject()
  @ValidateNested()
  @Type(() => LessonContentDto)
  content!: LessonContentDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  position?: number;
}

export class UpdateLessonDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LessonContentDto)
  content?: LessonContentDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  position?: number;
}
