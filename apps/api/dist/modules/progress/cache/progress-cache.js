var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
export const progressCacheKey = (userId, courseId) => `student:progress:${userId}:${courseId}`;
export class ProgressCache {
}
let NoopProgressCache = class NoopProgressCache extends ProgressCache {
    get() {
        return Promise.resolve(null);
    }
    set() {
        return Promise.resolve();
    }
    invalidateStudent() {
        return Promise.resolve();
    }
    invalidateCourse() {
        return Promise.resolve();
    }
};
NoopProgressCache = __decorate([
    Injectable()
], NoopProgressCache);
export { NoopProgressCache };
//# sourceMappingURL=progress-cache.js.map