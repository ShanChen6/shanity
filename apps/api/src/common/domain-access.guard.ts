import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { cookie, type AuthRequest } from '../auth/auth.guards.js';
import { DOMAIN_ROLES } from './api-v1-routes.js';
import type { ApiV1Request } from './api-v1.middleware.js';

/**
 * Router-level domain isolation for `/api/v1/<domain>/*`. Runs before any
 * controller guard, so a student can never reach an instructor or admin alias
 * even if a handler forgot its own @Roles. Handler guards (SessionGuard
 * @Roles, ownership guards) still apply on top — this only ever narrows.
 */
@Injectable()
export class DomainAccessGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<ApiV1Request & Partial<AuthRequest>>();
    const domain = request.apiV1?.domain;
    if (!domain) return true;
    const allowed = DOMAIN_ROLES[domain];
    if (allowed === 'public') return true;
    // Cached on the request so SessionGuard does not authenticate twice.
    request.principal ??= await this.auth.authenticate(
      cookie(request, this.auth.config.cookieName('access')),
    );
    if (!request.principal.roles.some((role) => allowed.includes(role)))
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden',
        code: 'FORBIDDEN_DOMAIN',
      });
    return true;
  }
}
