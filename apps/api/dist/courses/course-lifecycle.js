import { CourseStatus } from './course-status.js';
const allowedTransitions = {
    [CourseStatus.DRAFT]: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED],
    [CourseStatus.PUBLISHED]: [CourseStatus.DRAFT, CourseStatus.ARCHIVED],
    [CourseStatus.ARCHIVED]: [],
};
export class InvalidCourseTransitionError extends Error {
}
export function assertCourseTransition(current, next) {
    if (!allowedTransitions[current]?.includes(next))
        throw new InvalidCourseTransitionError(`Cannot transition course from ${current} to ${next}`);
}
//# sourceMappingURL=course-lifecycle.js.map