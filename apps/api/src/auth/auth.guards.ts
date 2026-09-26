import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, type Principal } from './auth.service.js';
import { AuthConfig } from './auth.config.js';
import { DatabaseService } from '../database/database.module.js';
import { digest } from './password.js';
export type AuthRequest = Request & { principal: Principal };
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const cookie = (req: Request, name: string): string | undefined => {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    name
  ];
  return typeof value === 'string' ? value : undefined;
};
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.principal = await this.auth.authenticate(
      cookie(req, this.auth.config.cookieName('access')),
    );
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      roles?.length &&
      !roles.some((role) => req.principal.roles.includes(role))
    )
      throw new ForbiddenException();
    return true;
  }
}
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AuthConfig) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin !== this.config.origin
    )
      throw new ForbiddenException('Invalid origin');
    return true;
  }
}
@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const key = digest(`${req.ip}:${context.getHandler().name}`);
    const result = await this.database.client.raw(
      `
      INSERT INTO auth_rate_limits(key, hits, expires_at) VALUES (?, 1, now() + interval '1 minute')
      ON CONFLICT(key) DO UPDATE SET
        hits = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE auth_rate_limits.hits + 1 END,
        expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN now() + interval '1 minute' ELSE auth_rate_limits.expires_at END
      RETURNING hits`,
      [key],
    );
    if (Number(result.rows[0].hits) > 10) {
      context
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('Retry-After', '60');
      throw new HttpException('Too many requests', 429);
    }
    return true;
  }
}
