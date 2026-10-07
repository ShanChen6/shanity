import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CourseOwnershipService } from './course-ownership.service.js';
export declare class CourseEnrollmentGuard implements CanActivate {
    private readonly dataSource;
    private readonly ownership;
    constructor(dataSource: DataSource, ownership: CourseOwnershipService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
