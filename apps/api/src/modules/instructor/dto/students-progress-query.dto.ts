import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const STUDENT_SORTS = [
  'percentage_desc',
  'percentage_asc',
  'last_accessed_desc',
] as const;
export const STUDENT_STATUSES = [
  'ALL',
  'COMPLETED',
  'IN_PROGRESS',
  'NOT_STARTED',
] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];
export type StudentStatusFilter = (typeof STUDENT_STATUSES)[number];
export type StudentProgressStatus = Exclude<StudentStatusFilter, 'ALL'>;

export class StudentsProgressQueryDto {
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(STUDENT_SORTS)
  sortBy: StudentSort = 'last_accessed_desc';

  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status: StudentStatusFilter = 'ALL';
}
