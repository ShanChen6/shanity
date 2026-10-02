import { describe, expect, it } from 'vitest';
import { CourseStatus } from './course-status.js';
import {
  assertCourseTransition,
  InvalidCourseTransitionError,
} from './course-lifecycle.js';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';

describe('course lifecycle transitions', () => {
  it('allows draft publish and archive, and published archive', () => {
    expect(() =>
      assertCourseTransition(CourseStatus.DRAFT, CourseStatus.PUBLISHED),
    ).not.toThrow();
    expect(() =>
      assertCourseTransition(CourseStatus.DRAFT, CourseStatus.ARCHIVED),
    ).not.toThrow();
    expect(() =>
      assertCourseTransition(CourseStatus.PUBLISHED, CourseStatus.ARCHIVED),
    ).not.toThrow();
  });

  it('allows unpublishing', () => {
    expect(() =>
      assertCourseTransition(CourseStatus.PUBLISHED, CourseStatus.DRAFT),
    ).not.toThrow();
  });

  it.each([
    [CourseStatus.ARCHIVED, CourseStatus.DRAFT],
    [CourseStatus.ARCHIVED, CourseStatus.PUBLISHED],
    [CourseStatus.ARCHIVED, CourseStatus.ARCHIVED],
  ])('rejects transition %s -> %s', (current, next) => {
    expect(() => assertCourseTransition(current, next)).toThrow(
      InvalidCourseTransitionError,
    );
  });
});

describe('course publishability', () => {
  const validator = new CoursePublishabilityValidator();
  const course = {
    title: 'Valid course',
    description: 'Useful description',
    thumbnail: 'course.webp',
    ownerId: 'owner-id',
    instructorId: null,
  };
  const facts = {
    sectionCount: 1,
    sectionsWithoutLessons: 0,
    lessonCount: 1,
    lessonsWithoutContent: 0,
  };

  it('accepts a complete course with lesson content', () => {
    expect(validator.validate(course, facts)).toEqual([]);
  });

  it('reports missing basics, sections, lessons, and lesson content', () => {
    expect(
      validator.validate(
        {
          title: ' ',
          description: null,
          thumbnail: null,
          ownerId: null,
          instructorId: null,
        },
        {
          sectionCount: 0,
          sectionsWithoutLessons: 1,
          lessonCount: 0,
          lessonsWithoutContent: 2,
        },
      ),
    ).toEqual([
      'Course title is required',
      'Course description is required',
      'Course thumbnail is required',
      'A course owner or instructor is required',
      'At least one section is required',
      'Every section must contain at least one lesson',
      'At least one lesson is required',
      'Every lesson must have text or video content',
    ]);
  });
});
