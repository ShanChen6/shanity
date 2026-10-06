import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateChapterDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateChapterDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  position?: number;
}

export class ChapterOrderDto {
  @IsUUID('4')
  id!: string;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  position!: number;
}

export class ReorderChaptersDto {
  @IsArray()
  @ArrayUnique((chapter: ChapterOrderDto) => chapter.id)
  @ValidateNested({ each: true })
  @Type(() => ChapterOrderDto)
  chapterOrders!: ChapterOrderDto[];
}
