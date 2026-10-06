import type { Relation } from 'typeorm';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';
import { Lesson } from '../../lessons/entities/lesson.entity.js';
export declare enum LessonProgressStatus {
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED"
}
export declare class LessonProgress {
    id: string;
    userId: string;
    user: Relation<User>;
    lessonId: string;
    lesson: Relation<Lesson>;
    courseId: string;
    course: Relation<Course>;
    status: LessonProgressStatus;
    lastPosition: number | null;
    startedAt: Date;
    lastAccessedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
