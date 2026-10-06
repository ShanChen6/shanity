var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { AuthConfig } from '../../../auth/auth.config.js';
import { cookie } from '../../../auth/auth.guards.js';
import { AuthService } from '../../../auth/auth.service.js';
import { CourseAccessService, } from '../../../courses/course-access.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function rejectLessonAccess(result) {
    switch (result.reason) {
        case 'LESSON_NOT_FOUND':
            throw new NotFoundException('Lesson not found');
        case 'AUTHENTICATION_REQUIRED':
            throw new ForbiddenException({
                statusCode: 403,
                message: 'ENROLLMENT_REQUIRED',
                code: 'ENROLLMENT_REQUIRED',
            });
        case 'ENROLLMENT_REQUIRED':
            throw new ForbiddenException({
                statusCode: 403,
                message: 'ENROLLMENT_REQUIRED',
                code: 'ENROLLMENT_REQUIRED',
            });
        case 'ENROLLMENT_SUSPENDED':
            throw new ForbiddenException({
                statusCode: 403,
                message: 'Enrollment Suspended',
                code: 'ENROLLMENT_SUSPENDED',
            });
        case 'PREREQUISITE_LESSON_NOT_COMPLETED':
            throw new ForbiddenException({
                statusCode: 403,
                message: 'PREREQUISITE_LESSON_NOT_COMPLETED',
                code: 'PREREQUISITE_LESSON_NOT_COMPLETED',
                requiredLesson: result.requiredLesson,
            });
        default:
            throw new ForbiddenException({
                statusCode: 403,
                message: 'LESSON_NOT_AVAILABLE',
                code: 'LESSON_NOT_AVAILABLE',
            });
    }
}
let LessonAccessGuard = class LessonAccessGuard {
    auth;
    config;
    policy;
    constructor(auth, config, policy) {
        this.auth = auth;
        this.config = config;
        this.policy = policy;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const params = request.params;
        const lessonId = params.id ?? params.lessonId;
        if (!lessonId || !UUID.test(lessonId))
            throw new NotFoundException('Lesson not found');
        const token = cookie(request, this.config.cookieName('access'));
        const principal = token ? await this.auth.authenticate(token) : undefined;
        const access = await this.policy.canAccessLesson(principal?.id, lessonId);
        if (!access.granted)
            rejectLessonAccess(access);
        request.lessonAccess = { principal, bypass: access.bypass === true };
        return true;
    }
};
LessonAccessGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AuthService,
        AuthConfig,
        CourseAccessService])
], LessonAccessGuard);
export { LessonAccessGuard };
//# sourceMappingURL=lesson-access.guard.js.map