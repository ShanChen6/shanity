import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsInt,
  IsString,
  Length,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @Length(12, 128) password!: string;
}
export class RegisterDto extends LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  displayName!: string;
}
export class ProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(/\S/)
  displayName!: string;
}
export class ListUsersQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(254)
  search?: string;
  @IsOptional()
  @IsIn(['student', 'instructor', 'admin'])
  role?: string;
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page: number = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class ChangeUserRoleDto {
  @IsIn(['STUDENT', 'INSTRUCTOR', 'ADMIN'])
  role!: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}

export class ChangeUserStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}
