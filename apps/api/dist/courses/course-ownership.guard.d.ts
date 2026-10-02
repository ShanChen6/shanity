import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
export interface CourseOwnershipOptions {
    resource?: 'course' | 'chapter';
    param?: string;
}
export declare const RequireCourseOwnership: (options?: CourseOwnershipOptions) => import("@nestjs/common").CustomDecorator<string>;
export declare class CourseOwnershipGuard implements CanActivate {
    private readonly dataSource;
    private readonly reflector;
    constructor(dataSource: DataSource, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private resourceId;
}
