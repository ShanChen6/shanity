import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  isURL,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../../common/slug.js';
import { BlogPostStatus } from './entities/blog-post.entity.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Blank optional text means "none". */
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const present = (_object: object, value: unknown) => value !== undefined;
const set = (_object: object, value: unknown) =>
  value !== undefined && value !== null;

export const BLOG_TITLE_MAX = 200;
export const BLOG_CONTENT_MAX = 100_000;
export const BLOG_EXCERPT_MAX = 500;
const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };
/** An image uploaded here, stored without a host (blog-images.controller). */
export const UPLOADED_IMAGE_PATH =
  /^\/blog-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cover: an uploaded image's path, or an http(s) URL elsewhere. */
const IsCoverImage = () =>
  ValidateBy({
    name: 'isCoverImage',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' &&
        (UPLOADED_IMAGE_PATH.test(value) || isURL(value, URL_OPTIONS)),
      defaultMessage: () =>
        'coverImage must be an uploaded image path or an http(s) URL',
    },
  });

export class CreateBlogPostDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_TITLE_MAX)
  title: string;

  /** Derived from the title when omitted. */
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BLOG_CONTENT_MAX)
  content?: string;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf(set)
  @IsString()
  @MaxLength(BLOG_EXCERPT_MAX)
  excerpt?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf(set)
  @IsCoverImage()
  @MaxLength(2048)
  coverImage?: string | null;

  @IsOptional()
  @ValidateIf(set)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @ValidateIf(set)
  @IsUUID()
  linkedCourseId?: string | null;
}

/** Every field optional; null clears the optional ones. */
export class UpdateBlogPostDto {
  @ValidateIf(present)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_TITLE_MAX)
  title?: string;

  @ValidateIf(present)
  @Transform(trimString)
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string;

  @ValidateIf(present)
  @IsString()
  @MaxLength(BLOG_CONTENT_MAX)
  content?: string;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf(set)
  @IsString()
  @MaxLength(BLOG_EXCERPT_MAX)
  excerpt?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf(set)
  @IsCoverImage()
  @MaxLength(2048)
  coverImage?: string | null;

  @IsOptional()
  @ValidateIf(set)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @ValidateIf(set)
  @IsUUID()
  linkedCourseId?: string | null;
}

export class ListBlogPostsQueryDto {
  @IsOptional()
  @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;

  /** Admins: only their own posts. Instructors always see only theirs. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export const BLOG_NOTE_MAX = 2000;

export class BlogReviewNoteDto {
  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf(set)
  @IsString()
  @MaxLength(BLOG_NOTE_MAX)
  note?: string | null;
}

/** Sending a post back always says why. */
export class RejectBlogPostDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BLOG_NOTE_MAX)
  note: string;
}

export class CreateBlogCategoryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(100)
  slug?: string;
}

export class PublicBlogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** A category slug. */
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(100)
  category?: string;
}

export const COMMENT_MAX_LENGTH = 2000;

export class CreateCommentDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  content: string;
}

export class CommentListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class AdminCommentQueryDto {
  /** Default: the review queue (PENDING). */
  @IsOptional()
  @IsIn(['APPROVED', 'PENDING', 'REJECTED'])
  status?: 'APPROVED' | 'PENDING' | 'REJECTED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CommentDecisionDto {
  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf(set)
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
