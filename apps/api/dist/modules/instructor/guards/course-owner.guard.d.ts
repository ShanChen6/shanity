import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import type { AuthRequest } from '../../../auth/auth.guards.js';
export declare const COURSE_PROGRESS_FORBIDDEN = "You do not have permission to view progress for this course";
export type OwnedCourse = {
    id: string;
    title: string;
};
export type CourseOwnerRequest = AuthRequest & {
    ownedCourse?: OwnedCourse;
};
export declare class CourseOwnerGuard implements CanActivate {
    private readonly database;
    constructor(database: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
