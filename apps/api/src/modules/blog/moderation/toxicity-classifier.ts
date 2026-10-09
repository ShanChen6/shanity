/** HTTP seam: tests and other runtimes inject their own fetch. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
export const MODERATION_HTTP_FETCH = Symbol('MODERATION_HTTP_FETCH');

export interface ToxicityResult {
  /** 0..1: the highest of the provider's category scores. */
  score: number;
  /** Category -> score, as the provider named them. */
  categories: Record<string, number>;
  provider: string;
}

/**
 * Layer 2 of comment moderation: a hosted classifier scoring how toxic a
 * text is. Resolves null when it cannot answer (not configured, timeout,
 * quota, outage): the pipeline then holds the comment for review rather
 * than guessing.
 */
export abstract class ToxicityClassifier {
  abstract readonly provider: string;
  abstract classify(text: string): Promise<ToxicityResult | null>;
}

/** How long a comment may wait on the AI before it is held for review. */
export const CLASSIFIER_TIMEOUT_MS = 4000;

export const maxScore = (categories: Record<string, number>) =>
  Math.min(1, Math.max(0, ...Object.values(categories)));
