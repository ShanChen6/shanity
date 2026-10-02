import type { Relation } from 'typeorm';
import { Course } from './course.entity.js';
export declare class Chapter {
    id: string;
    courseId: string;
    course: Relation<Course>;
    title: string;
    description: string | null;
    position: number;
    createdAt: Date;
    updatedAt: Date;
}
