import type { Relation } from 'typeorm';
import { Course } from './course.entity.js';
import { User } from '../users/user.entity.js';
export declare class Enrollment {
    id: string;
    userId: string;
    user: Relation<User>;
    courseId: string;
    course: Relation<Course>;
    enrolledAt: Date;
}
