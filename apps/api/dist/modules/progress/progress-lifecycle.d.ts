import { LessonType } from '../lessons/entities/lesson.entity.js';
import { LessonProgressStatus } from './entities/lesson-progress.entity.js';
export declare const TEXT_COMPLETION_THRESHOLD = 80;
export declare const VIDEO_COMPLETION_THRESHOLD = 85;
export type CompletionEvidence = {
    percentage?: number;
    explicit?: boolean;
    videoEnded?: boolean;
    documentDownloaded?: boolean;
    reachedLastPage?: boolean;
    downloadAllowed?: boolean;
};
export declare class CompletionCriteriaError extends Error {
}
export declare function startTransition(status: LessonProgressStatus): LessonProgressStatus.IN_PROGRESS | LessonProgressStatus.COMPLETED;
export declare function completionCriteriaMet(type: LessonType, evidence: CompletionEvidence): boolean;
export declare function completeTransition(status: LessonProgressStatus, type: LessonType, evidence: CompletionEvidence): LessonProgressStatus.COMPLETED;
