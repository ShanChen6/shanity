import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CourseAccessType } from '../course-access-type.js';
import { CourseCurrency, MAX_PRICE_MINOR_UNITS } from '../course-currency.js';

export class UpdateCoursePricingDto {
  @IsEnum(CourseAccessType)
  accessType!: CourseAccessType;

  // Minor units (VND integer, USD cents). Required when PAID, 0/omitted if FREE.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_MINOR_UNITS[CourseCurrency.VND])
  price?: number;

  @IsOptional()
  @IsEnum(CourseCurrency)
  currency?: CourseCurrency;
}
