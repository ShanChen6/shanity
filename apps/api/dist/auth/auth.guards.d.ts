import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, type Principal } from './auth.service.js';
import { AuthConfig } from './auth.config.js';
import { DatabaseService } from '../database/database.module.js';
export type AuthRequest = Request & {
    principal: Principal;
};
export declare const Roles: (...roles: string[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const cookie: (req: Request, name: string) => string | undefined;
export declare class SessionGuard implements CanActivate {
    private readonly auth;
    private readonly reflector;
    constructor(auth: AuthService, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare class OriginGuard implements CanActivate {
    private readonly config;
    constructor(config: AuthConfig);
    canActivate(context: ExecutionContext): boolean;
}
export declare class AuthRateGuard implements CanActivate {
    private readonly database;
    constructor(database: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
