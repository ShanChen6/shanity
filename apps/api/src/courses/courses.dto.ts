import { Transform } from 'class-transformer';
import {
  IsOptional,
  ValidateIf,
  IsString,
  Length,
  Matches,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCourseDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trimString)
  @Length(1, 100)
  category?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['Beginner', 'Intermediate', 'Advanced'])
  level?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trimString)
  @Length(2, 35)
  language?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  price?: number;

  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title!: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  thumbnail?: string | null;
}

export class UpdateCourseDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trimString)
  @Length(1, 100)
  category?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['Beginner', 'Intermediate', 'Advanced'])
  level?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Transform(trimString)
  @Length(2, 35)
  language?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  price?: number;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  thumbnail?: string | null;
}
