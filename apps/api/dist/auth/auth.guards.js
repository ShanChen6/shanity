var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, HttpException, Injectable, SetMetadata, } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { AuthConfig } from './auth.config.js';
import { DatabaseService } from '../database/database.module.js';
import { digest } from './password.js';
export const Roles = (...roles) => SetMetadata('roles', roles);
export const cookie = (req, name) => {
    const value = req.cookies?.[name];
    return typeof value === 'string' ? value : undefined;
};
let SessionGuard = class SessionGuard {
    auth;
    reflector;
    constructor(auth, reflector) {
        this.auth = auth;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        req.principal = await this.auth.authenticate(cookie(req, this.auth.config.cookieName('access')));
        const roles = this.reflector.getAllAndOverride('roles', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (roles?.length &&
            !roles.some((role) => req.principal.roles.includes(role)))
            throw new ForbiddenException();
        return true;
    }
};
SessionGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AuthService,
        Reflector])
], SessionGuard);
export { SessionGuard };
let OriginGuard = class OriginGuard {
    config;
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
            req.headers.origin !== this.config.origin)
            throw new ForbiddenException('Invalid origin');
        return true;
    }
};
OriginGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AuthConfig])
], OriginGuard);
export { OriginGuard };
let AuthRateGuard = class AuthRateGuard {
    database;
    constructor(database) {
        this.database = database;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const key = digest(`${req.ip}:${context.getHandler().name}`);
        const result = await this.database.dataSource.query(`
      INSERT INTO auth_rate_limits(key, hits, expires_at) VALUES ($1, 1, now() + interval '1 minute')
      ON CONFLICT(key) DO UPDATE SET
        hits = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE auth_rate_limits.hits + 1 END,
        expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN now() + interval '1 minute' ELSE auth_rate_limits.expires_at END
      RETURNING hits`, [key]);
        if (Number(result[0].hits) > 10) {
            context
                .switchToHttp()
                .getResponse()
                .setHeader('Retry-After', '60');
            throw new HttpException('Too many requests', 429);
        }
        return true;
    }
};
AuthRateGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], AuthRateGuard);
export { AuthRateGuard };
//# sourceMappingURL=auth.guards.js.map