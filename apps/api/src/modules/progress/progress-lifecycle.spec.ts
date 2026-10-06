import { describe, expect, it } from 'vitest';
import { LessonType } from '../lessons/entities/lesson.entity.js';
import { LessonProgressStatus } from './entities/lesson-progress.entity.js';
import {
  completeTransition,
  CompletionCriteriaError,
  completionCriteriaMet,
  startTransition,
} from './progress-lifecycle.js';

describe('lesson progress lifecycle', () => {
  it('starts only a not-started lesson and never completes it on open', () => {
    expect(startTransition(LessonProgressStatus.NOT_STARTED)).toBe(
      LessonProgressStatus.IN_PROGRESS,
    );
    expect(startTransition(LessonProgressStatus.IN_PROGRESS)).toBe(
      LessonProgressStatus.IN_PROGRESS,
    );
    expect(startTransition(LessonProgressStatus.COMPLETED)).toBe(
      LessonProgressStatus.COMPLETED,
    );
  });

  it('requires both 80% scroll and an explicit action for text', () => {
    expect(completionCriteriaMet(LessonType.TEXT, { percentage: 100 })).toBe(
      false,
    );
    expect(
      completionCriteriaMet(LessonType.TEXT, {
        percentage: 79.9,
        explicit: true,
      }),
    ).toBe(false);
    expect(
      completionCriteriaMet(LessonType.TEXT, {
        percentage: 80,
        explicit: true,
      }),
    ).toBe(true);
  });

  it('completes video at 85% or on ended, but not below the threshold', () => {
    expect(completionCriteriaMet(LessonType.VIDEO, { percentage: 84.9 })).toBe(
      false,
    );
    expect(completionCriteriaMet(LessonType.VIDEO, { percentage: 85 })).toBe(
      true,
    );
    expect(completionCriteriaMet(LessonType.VIDEO, { videoEnded: true })).toBe(
      true,
    );
  });

  it('applies the document download policy', () => {
    expect(
      completionCriteriaMet(LessonType.DOCUMENT, {
        downloadAllowed: true,
        documentDownloaded: true,
      }),
    ).toBe(true);
    expect(
      completionCriteriaMet(LessonType.DOCUMENT, {
        downloadAllowed: true,
        reachedLastPage: true,
      }),
    ).toBe(true);
    expect(
      completionCriteriaMet(LessonType.DOCUMENT, {
        downloadAllowed: false,
        reachedLastPage: true,
      }),
    ).toBe(false);
    expect(
      completionCriteriaMet(LessonType.DOCUMENT, {
        downloadAllowed: false,
        reachedLastPage: true,
        explicit: true,
      }),
    ).toBe(true);
  });

  it('rejects completion without evidence and keeps completion idempotent', () => {
    expect(() =>
      completeTransition(LessonProgressStatus.IN_PROGRESS, LessonType.VIDEO, {
        percentage: 50,
      }),
    ).toThrow(CompletionCriteriaError);
    expect(
      completeTransition(LessonProgressStatus.COMPLETED, LessonType.VIDEO, {
        videoEnded: true,
      }),
    ).toBe(LessonProgressStatus.COMPLETED);
  });
});
