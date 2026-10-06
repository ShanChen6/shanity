import { DataSource } from 'typeorm';
import type { Principal } from '../auth/auth.service.js';
export declare const managesCourseSql: (userParam: string) => string;
export declare class CourseOwnershipService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    canManageCourse(principal: Pick<Principal, 'id' | 'roles'>, courseId: string | null): Promise<boolean>;
}
