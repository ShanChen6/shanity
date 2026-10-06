var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, } from '@nestjs/common';
import { from, mergeMap, tap } from 'rxjs';
import { DatabaseService } from '../../database/database.module.js';
import { CurriculumEvents } from './curriculum-events.js';
let CurriculumChangedInterceptor = class CurriculumChangedInterceptor {
    database;
    events;
    constructor(database, events) {
        this.database = database;
        this.events = events;
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        if (request.method === 'GET')
            return next.handle();
        return from(this.courseIdFor(request)).pipe(mergeMap((courseId) => next.handle().pipe(tap(() => {
            if (courseId)
                this.events.emitChanged({
                    courseId,
                    source: `${request.method} ${routePath(request)}`,
                });
        }))));
    }
    async courseIdFor(request) {
        const params = request.params;
        const path = routePath(request);
        const lookup = async (table, id) => {
            if (!id)
                return null;
            const [row] = await this.database.dataSource
                .query(`SELECT course_id AS "courseId" FROM ${table} WHERE id = $1`, [id])
                .catch(() => []);
            return row?.courseId ?? null;
        };
        if (params.courseId)
            return params.courseId;
        if (params.chapterId)
            return lookup('chapters', params.chapterId);
        if (/\/lessons\/:id(\/|$)/.test(path))
            return lookup('lessons', params.id);
        if (/\/chapters\/:id(\/|$)/.test(path))
            return lookup('chapters', params.id);
        if (/\/courses\/:id(\/|$)/.test(path))
            return params.id ?? null;
        return null;
    }
};
CurriculumChangedInterceptor = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        CurriculumEvents])
], CurriculumChangedInterceptor);
export { CurriculumChangedInterceptor };
const routePath = (request) => String(request.route?.path ?? request.path);
//# sourceMappingURL=curriculum-changed.interceptor.js.map