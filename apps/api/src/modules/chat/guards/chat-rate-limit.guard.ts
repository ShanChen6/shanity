import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthRequest } from '../../../auth/auth.guards.js';
import { RateLimiter } from '../../../cache/rate-limiter.js';

/** Flood control for sending: at most 5 messages in any 3-second span. */
export const CHAT_SEND_LIMIT = 5;
export const CHAT_SEND_WINDOW_MS = 3000;

/**
 * Per user, across all rooms (spreading a flood over several courses gains
 * nothing). Goes after ChatEnrollmentGuard so non-members cannot burn a
 * member's budget, and only accepted attempts count towards it.
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const { principal } = http.getRequest<AuthRequest>();
    const { allowed, retryAfterMs } = await this.limiter.consume(
      `chat:send:${principal.id}`,
      CHAT_SEND_LIMIT,
      CHAT_SEND_WINDOW_MS,
    );
    if (allowed) return true;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      {
        statusCode: 429,
        message: 'CHAT_RATE_LIMITED',
        code: 'CHAT_RATE_LIMITED',
        retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
