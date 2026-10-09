import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Body the Pusher client posts to the auth endpoint (form-encoded by
 * default, JSON also accepted). Field names are the SDK's own.
 */
export class ChatAuthDto {
  // Pusher socket ids look like `123456.7890123`.
  @IsString()
  @Matches(/^\d+\.\d+$/)
  @MaxLength(64)
  socket_id: string;

  @IsString()
  @MaxLength(200)
  channel_name: string;
}

export const CHAT_HISTORY_DEFAULT_LIMIT = 30;
export const CHAT_HISTORY_MAX_LIMIT = 100;

/**
 * `cursor`: page backwards, messages older than it (scrolling up).
 * `after`: page forwards, messages newer than it (catching up after a
 * disconnect). Neither: the latest page. Both are opaque `cursor` values
 * taken from returned messages.
 */
export class ChatHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CHAT_HISTORY_MAX_LIMIT)
  limit?: number;
}

export const CHAT_REASON_MAX_LENGTH = 1000;
/** Longest single mute: 30 days. */
export const CHAT_MUTE_MAX_MINUTES = 30 * 24 * 60;

export class ReportChatMessageDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_REASON_MAX_LENGTH)
  reason: string;
}

export class HideChatMessageDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_REASON_MAX_LENGTH)
  reason?: string;
}

export class MuteChatUserDto {
  /** The course whose room the user may no longer send to. */
  @IsUUID()
  courseId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CHAT_MUTE_MAX_MINUTES)
  durationMinutes: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_REASON_MAX_LENGTH)
  reason?: string;
}

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

export class SendChatMessageDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_MESSAGE_MAX_LENGTH)
  content: string;
}

export class ChatModerationQueueQueryDto {
  /** One course only; otherwise every course the caller moderates. */
  @IsOptional()
  @IsUUID()
  courseId?: string;
}
