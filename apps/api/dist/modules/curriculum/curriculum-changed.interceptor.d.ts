import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { CurriculumEvents } from './curriculum-events.js';
export declare class CurriculumChangedInterceptor implements NestInterceptor {
    private readonly database;
    private readonly events;
    constructor(database: DatabaseService, events: CurriculumEvents);
    intercept(context: ExecutionContext, next: CallHandler): import("rxjs").Observable<any>;
    private courseIdFor;
}
