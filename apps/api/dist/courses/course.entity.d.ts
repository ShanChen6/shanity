import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { Enrollment } from './enrollment.entity.js';
import { CourseStatus } from './course-status.js';
export declare class Course {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    thumbnail: string | null;
    status: CourseStatus;
    instructorId: string | null;
    instructor: User | null;
    ownerId: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    chapters: Chapter[];
    enrollments: Enrollment[];
}
