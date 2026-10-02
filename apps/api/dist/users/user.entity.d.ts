import { Enrollment } from '../courses/enrollment.entity.js';
export declare class User {
    id: string;
    email: string;
    displayName: string;
    passwordHash: string | null;
    status: string;
    avatarKey: string | null;
    createdAt: Date;
    updatedAt: Date;
    enrollments: Enrollment[];
}
