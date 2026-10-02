import { CourseStatus } from './course-status.js';

const allowedTransitions: Partial<Record<CourseStatus, CourseStatus[]>> = {
  [CourseStatus.DRAFT]: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED],
  [CourseStatus.PUBLISHED]: [CourseStatus.ARCHIVED],
  [CourseStatus.ARCHIVED]: [],
};

export class InvalidCourseTransitionError extends Error {}

export function assertCourseTransition(
  current: CourseStatus,
  next: CourseStatus,
) {
  if (!allowedTransitions[current]?.includes(next))
    throw new InvalidCourseTransitionError(
      `Cannot transition course from ${current} to ${next}`,
    );
}