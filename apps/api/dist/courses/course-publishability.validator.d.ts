import type { Course } from './course.entity.js';
import { LessonType } from '../modules/lessons/entities/lesson.entity.js';
export interface PublishableLessonContent {
    type: LessonType;
    textBody: string | null;
    videoAssetId: string | null;
    videoExternalUrl: string | null;
    documentAssetId: string | null;
}
export declare function isLessonContentValid(lesson: PublishableLessonContent): boolean;
export interface CoursePublishabilityFacts {
    sectionCount: number;
    sectionsWithoutLessons: number;
    lessonCount: number;
    lessonsWithoutContent: number;
}
export declare class CoursePublishabilityValidator {
    validate(course: Pick<Course, 'title' | 'description' | 'thumbnail' | 'ownerId' | 'instructorId'>, facts: CoursePublishabilityFacts): string[];
}
