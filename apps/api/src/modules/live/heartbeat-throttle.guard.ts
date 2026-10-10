import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthRequest } from '../../auth/auth.guards.js';
import { RateLimiter } from '../../cache/rate-limiter.js';

/**
 * Requests per student and session per minute. An honest client sends two
 * (one per 30 s); the slack covers retries after a network blip.
 */
export const HEARTBEAT_LIMIT = 4;
export const HEARTBEAT_WINDOW_MS = 60_000;

/**
 * First line against ping floods (Redis-backed, shared by every instance):
 * a script hammering the endpoint is refused before it reaches the
 * database. Crediting is guarded separately by the minimum gap in
 * LiveAttendanceService, so even requests that pass here earn nothing extra.
 */
@Injectable()
export class HeartbeatThrottleGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthRequest>();
    const sessionId = (request.params as Record<string, string>).id;
    const { allowed, retryAfterMs } = await this.limiter.consume(
      `live:heartbeat:${request.principal.id}:${sessionId}`,
      HEARTBEAT_LIMIT,
      HEARTBEAT_WINDOW_MS,
    );
    if (allowed) return true;
    http
      .getResponse<Response>()
      .setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      );
    throw new HttpException(
      {
        statusCode: 429,
        message: 'LIVE_HEARTBEAT_RATE_LIMITED',
        code: 'LIVE_HEARTBEAT_RATE_LIMITED',
        retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
