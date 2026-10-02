import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCourseDto {
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