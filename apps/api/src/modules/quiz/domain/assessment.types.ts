/**
 * Sprint 9 E1 contracts for the multi-modal assessment extension.
 *
 * This file intentionally contains no persistence or validation logic. The
 * entities, DTOs and migration introduced by E2-E4 should depend on these
 * contracts instead of declaring slightly different local shapes.
 */

/**
 * The full target enum. SINGLE_CHOICE is retained because it already exists
 * in Sprint 7; ESSAY is additive and must not invalidate old snapshots.
 */
export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  ESSAY = 'ESSAY',
}

export enum EssaySubmissionType {
  TEXT_WITH_KATEX = 'TEXT_WITH_KATEX',
  FILE_UPLOAD = 'FILE_UPLOAD',
}

export interface EssayRubricCriterion {
  criterion: string;
  maxPoints: number;
  description?: string;
}

/** Stored in quiz_questions.essay_config and copied into attempt snapshots. */
export interface EssayConfig {
  allowedSubmissionTypes: EssaySubmissionType[];
  maxFileUploads: number;
  maxWords?: number;
  gradingGuide?: string;
  rubric?: EssayRubricCriterion[];
  /** @deprecated Read compatibility for essay_config rows written by E2. */
  gradingRubric?: EssayRubricCriterion[];
}

export interface EssayAttachment {
  /** Stable storage URL/key; never persist an expiring signed download URL. */
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Stored in attempt_answers.essay_answer. */
export interface EssayAnswer {
  /** Plain text/Markdown containing optional KaTeX/LaTeX source. */
  text?: string;
  attachments?: EssayAttachment[];
}

export interface EssayRubricScore {
  /** Index into the rubric frozen in the attempt snapshot. */
  criterionIndex: number;
  score: number;
}

export enum EssayGradingStatus {
  UNGRADED = 'UNGRADED',
  GRADED = 'GRADED',
}

/**
 * A discriminated union prevents an UNGRADED answer from carrying fabricated
 * points or grader audit data.
 */
export type EssayGrading =
  | {
      status: EssayGradingStatus.UNGRADED;
      awardedPoints: null;
    }
  | {
      status: EssayGradingStatus.GRADED;
      awardedPoints: number;
      rubricScores: EssayRubricScore[];
      feedback: string;
      gradedBy: string;
      gradedAt: Date;
    };

/** JSONB cannot preserve a JavaScript Date; persist gradedAt as ISO-8601. */
export type EssayGradingJson =
  | {
      status: EssayGradingStatus.UNGRADED;
      awardedPoints: null;
    }
  | {
      status: EssayGradingStatus.GRADED;
      awardedPoints: number;
      rubricScores: EssayRubricScore[];
      feedback: string;
      gradedBy: string;
      gradedAt: string;
    };

/** Canonical target lifecycle; PASSED/FAILED remains a derived outcome. */
export enum AssessmentAttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTING = 'SUBMITTING',
  NEEDS_GRADING = 'NEEDS_GRADING',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}
