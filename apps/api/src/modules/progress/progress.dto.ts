import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class VideoProgressDto {
  @IsInt()
  @Min(0)
  seconds!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @IsBoolean()
  ended?: boolean;
}

export class CompleteLessonDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  scrollPercentage?: number;

  @IsOptional()
  @IsBoolean()
  reachedLastPage?: boolean;

  @IsOptional()
  @IsBoolean()
  downloaded?: boolean;
}
