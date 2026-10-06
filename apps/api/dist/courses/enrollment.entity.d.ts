import type { Relation } from 'typeorm';
import { Course } from './course.entity.js';
import { User } from '../users/user.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
export declare class Enrollment {
    id: string;
    userId: string;
    user: Relation<User>;
    courseId: string;
    course: Relation<Course>;
    enrolledAt: Date;
    revokedAt: Date | null;
    lastAccessedLessonId: string | null;
    lastAccessedLesson: Relation<Lesson> | null;
    lastAccessedAt: Date | null;
}
