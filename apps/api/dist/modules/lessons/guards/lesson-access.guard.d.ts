import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthConfig } from '../../../auth/auth.config.js';
import { AuthService } from '../../../auth/auth.service.js';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseAccessService, type LessonAccessResult } from '../../../courses/course-access.service.js';
export type LessonAccessContext = {
    principal?: Principal;
    bypass: boolean;
};
export type LessonAccessRequest = Request & {
    lessonAccess?: LessonAccessContext;
};
export declare function rejectLessonAccess(result: LessonAccessResult): never;
export declare class LessonAccessGuard implements CanActivate {
    private readonly auth;
    private readonly config;
    private readonly policy;
    constructor(auth: AuthService, config: AuthConfig, policy: CourseAccessService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
