import { EventEmitter } from 'node:events';
export declare const COURSE_CURRICULUM_CHANGED = "course.curriculum.updated";
export type CourseCurriculumChanged = {
    courseId: string;
    source: string;
};
export declare class CurriculumEvents {
    private readonly emitter;
    emitChanged(event: CourseCurriculumChanged): void;
    onChanged(listener: (event: CourseCurriculumChanged) => void | Promise<void>): () => EventEmitter<[never]>;
}
