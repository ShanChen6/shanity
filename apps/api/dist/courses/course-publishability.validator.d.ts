import type { Course } from './course.entity.js';
export interface CoursePublishabilityFacts {
    sectionCount: number;
    sectionsWithoutLessons: number;
    lessonCount: number;
    lessonsWithoutContent: number;
}
export declare class CoursePublishabilityValidator {
    validate(course: Pick<Course, 'title' | 'description' | 'thumbnail' | 'ownerId' | 'instructorId'>, facts: CoursePublishabilityFacts): string[];
}
