import { Injectable } from '@nestjs/common';
import type { Course } from './course.entity.js';

export interface CoursePublishabilityFacts {
  sectionCount: number;
  sectionsWithoutLessons: number;
  lessonCount: number;
  lessonsWithoutContent: number;
}

@Injectable()
export class CoursePublishabilityValidator {
  validate(
    course: Pick<Course, 'title' | 'description' | 'thumbnail' | 'ownerId' | 'instructorId'>,
    facts: CoursePublishabilityFacts,
  ) {
    const errors: string[] = [];
    if (!course.title?.trim()) errors.push('Course title is required');
    if (!course.description?.trim()) errors.push('Course description is required');
    if (!course.thumbnail?.trim()) errors.push('Course thumbnail is required');
    if (!course.ownerId && !course.instructorId)
      errors.push('A course owner or instructor is required');
    if (facts.sectionCount < 1) errors.push('At least one section is required');
    if (facts.sectionsWithoutLessons > 0)
      errors.push('Every section must contain at least one lesson');
    if (facts.lessonCount < 1) errors.push('At least one lesson is required');
    if (facts.lessonsWithoutContent > 0)
      errors.push('Every lesson must have text or video content');
    return errors;
  }
}