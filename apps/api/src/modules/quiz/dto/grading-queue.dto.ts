import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// NEEDS_GRADING: essays await the instructor. GRADED: graded, result still
// private. PUBLISHED: the learner can see the result.
export const GRADING_QUEUE_STATUSES = [
  'NEEDS_GRADING',
  'GRADED',
  'PUBLISHED',
] as const;
export type GradingQueueStatus = (typeof GRADING_QUEUE_STATUSES)[number];

/** `status` omitted lists both pending and graded attempts. */
export class GradingQueueQueryDto {
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
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  quizId?: string;

  @IsOptional()
  @IsIn(GRADING_QUEUE_STATUSES)
  status?: GradingQueueStatus;

  // Student display name or email.
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class GradingQueueItemDto {
  attemptId: string;
  student: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  // Null for a STANDALONE quiz.
  course: { id: string; title: string; slug: string | null } | null;
  quiz: { id: string; title: string };
  submittedAt: Date | null;
  totalEssays: number;
  pendingEssaysCount: number;
  // GRADED: graded but private; COMPLETED: published to the learner.
  status: 'NEEDS_GRADING' | 'GRADED' | 'COMPLETED';
  publishedAt: Date | null;
}

export class GradingQueueResponseDto {
  items: GradingQueueItemDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
