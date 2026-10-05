import type { Relation } from 'typeorm';
import { Course } from './course.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
export declare class Chapter {
    id: string;
    courseId: string;
    course: Relation<Course>;
    lessons: Relation<Lesson[]>;
    title: string;
    description: string | null;
    position: number;
    createdAt: Date;
    updatedAt: Date;
}
