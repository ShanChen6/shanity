import { CourseStatus } from './course-status.js';
export declare class InvalidCourseTransitionError extends Error {
}
export declare function assertCourseTransition(current: CourseStatus, next: CourseStatus): void;
