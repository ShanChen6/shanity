import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import {
  LiveSessionProvider,
  LiveSessionStatus,
} from './entities/live-session.entity.js';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Longest live session (CHK_live_sessions_window). */
export const LIVE_SESSION_MAX_MS = 12 * 60 * 60 * 1000;

const time = (value: unknown) =>
  typeof value === 'string' ? Date.parse(value) : Number.NaN;

/** The ISO timestamp lies in the future. */
function IsInFuture(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isInFuture',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be in the future`, ...options },
      validator: { validate: (value: unknown) => time(value) > Date.now() },
    });
}

/** Later than `other`, and at most LIVE_SESSION_MAX_MS after it. */
function IsAfter(other: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isAfter',
      target: object.constructor,
      propertyName,
      constraints: [other],
      options: {
        message: `${propertyName} must be after ${other}, by at most 12 hours`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const start = time((args.object as Record<string, unknown>)[other]);
          const end = time(value);
          return end > start && end - start <= LIVE_SESSION_MAX_MS;
        },
      },
    });
}

export class CreateLiveSessionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** ISO 8601 with a zone. Must be in the future. */
  @IsISO8601({ strict: true })
  @IsInFuture()
  startTime: string;

  @IsISO8601({ strict: true })
  @IsAfter('startTime')
  endTime: string;

  /** Any link to the stream or room; normalized (or refused) by the API. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  embedUrl: string;

  /** Optional: must match the provider the link turns out to be. */
  @IsOptional()
  @IsEnum(LiveSessionProvider)
  provider?: LiveSessionProvider;
}

/** What a teacher can say that the clock cannot. */
export class UpdateLiveSessionStatusDto {
  @IsIn([LiveSessionStatus.CANCELLED, LiveSessionStatus.ENDED])
  status: LiveSessionStatus.CANCELLED | LiveSessionStatus.ENDED;
}

/** Longest range one calendar request may ask for (a month view is ~6 weeks). */
export const SCHEDULE_MAX_DAYS = 100;

export class MyScheduleQueryDto {
  @IsISO8601({ strict: true })
  startDate: string;

  @IsISO8601({ strict: true })
  @IsWithinDaysOf('startDate', SCHEDULE_MAX_DAYS)
  endDate: string;
}

/** After `other`, by at most `days` days. */
function IsWithinDaysOf(
  other: string,
  days: number,
  options?: ValidationOptions,
) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isWithinDaysOf',
      target: object.constructor,
      propertyName,
      constraints: [other, days],
      options: {
        message: `${propertyName} must be after ${other}, by at most ${days} days`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const start = time((args.object as Record<string, unknown>)[other]);
          const end = time(value);
          return end > start && end - start <= days * 86_400_000;
        },
      },
    });
}
