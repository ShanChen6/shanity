import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthConfig } from './auth.config.js';

@Injectable()
@Catch()
export class OAuthRedirectFilter implements ExceptionFilter {
  constructor(private readonly config: AuthConfig) {}
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const code =
      status === 409
        ? 'account_conflict'
        : status === 429
          ? 'rate_limited'
          : status === 503
            ? 'unavailable'
            : status === 401 && req.query.error === 'access_denied'
              ? 'cancelled'
              : 'failed';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.clearCookie(
      this.config.cookieName('oauth'),
      this.config.cookieOptions(0),
    );
    res.redirect(`${this.config.origin}/auth/callback?error=${code}`);
  }
}
