var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable, } from '@nestjs/common';
const UNTRUSTED_OWNERSHIP_FIELDS = [
    'courseId',
    'instructorId',
    'authorId',
];
let LessonRequestSanitizationInterceptor = class LessonRequestSanitizationInterceptor {
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        if (request.body && typeof request.body === 'object') {
            const body = request.body;
            for (const field of UNTRUSTED_OWNERSHIP_FIELDS)
                delete body[field];
        }
        return next.handle();
    }
};
LessonRequestSanitizationInterceptor = __decorate([
    Injectable()
], LessonRequestSanitizationInterceptor);
export { LessonRequestSanitizationInterceptor };
//# sourceMappingURL=lesson-request-sanitization.interceptor.js.map