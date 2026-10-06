import { LessonType } from '../lessons/entities/lesson.entity.js';
import { LessonProgressStatus } from './entities/lesson-progress.entity.js';

export const TEXT_COMPLETION_THRESHOLD = 80;
export const VIDEO_COMPLETION_THRESHOLD = 85;

export type CompletionEvidence = {
  percentage?: number;
  explicit?: boolean;
  videoEnded?: boolean;
  documentDownloaded?: boolean;
  reachedLastPage?: boolean;
  downloadAllowed?: boolean;
};

export class CompletionCriteriaError extends Error {}

export function startTransition(status: LessonProgressStatus) {
  return status === LessonProgressStatus.NOT_STARTED
    ? LessonProgressStatus.IN_PROGRESS
    : status;
}

export function completionCriteriaMet(
  type: LessonType,
  evidence: CompletionEvidence,
): boolean {
  if (type === LessonType.TEXT)
    return Boolean(
      evidence.explicit &&
      evidence.percentage !== undefined &&
      evidence.percentage >= TEXT_COMPLETION_THRESHOLD,
    );
  if (type === LessonType.VIDEO)
    return Boolean(
      evidence.videoEnded ||
      (evidence.percentage !== undefined &&
        evidence.percentage >= VIDEO_COMPLETION_THRESHOLD),
    );
  return evidence.downloadAllowed
    ? Boolean(evidence.documentDownloaded || evidence.reachedLastPage)
    : Boolean(evidence.reachedLastPage && evidence.explicit);
}

export function completeTransition(
  status: LessonProgressStatus,
  type: LessonType,
  evidence: CompletionEvidence,
) {
  if (!completionCriteriaMet(type, evidence))
    throw new CompletionCriteriaError('Lesson completion criteria are not met');
  return status === LessonProgressStatus.COMPLETED
    ? status
    : LessonProgressStatus.COMPLETED;
}
