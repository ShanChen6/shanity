import { DatabaseService } from '../../../database/database.module.js';
export declare class EnrollmentPolicy {
    private readonly database;
    constructor(database: DatabaseService);
    requireActive(userId: string, courseId: string): Promise<void>;
}
