import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export const COURSE_CURRICULUM_CHANGED = 'course.curriculum.updated';

// Anything that can change which lessons count toward progress: lessons added,
// removed, (un)published, required/optional, reordered; chapters removed or
// reordered; course status changes.
export type CourseCurriculumChanged = {
  courseId: string;
  // "METHOD /route/:pattern" of the mutation, for logs and diagnostics.
  source: string;
};

/**
 * In-process event bus for curriculum mutations. Listeners run after the
 * mutation has committed. Progress itself is never stored, so listeners only
 * maintain derived state (caches); a failing listener must not fail the edit.
 */
@Injectable()
export class CurriculumEvents {
  private readonly emitter = new EventEmitter();

  emitChanged(event: CourseCurriculumChanged) {
    this.emitter.emit(COURSE_CURRICULUM_CHANGED, event);
  }

  onChanged(
    listener: (event: CourseCurriculumChanged) => void | Promise<void>,
  ) {
    const wrapped = (event: CourseCurriculumChanged) => {
      void Promise.resolve()
        .then(() => listener(event))
        .catch(() => undefined);
    };
    this.emitter.on(COURSE_CURRICULUM_CHANGED, wrapped);
    return () => this.emitter.off(COURSE_CURRICULUM_CHANGED, wrapped);
  }
}
