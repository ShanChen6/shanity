import { Logger } from '@nestjs/common';
import {
  CLASSIFIER_TIMEOUT_MS,
  maxScore,
  ToxicityClassifier,
  type FetchLike,
  type ToxicityResult,
} from './toxicity-classifier.js';

/** Attributes requested; SPAM is English-only, so it is not asked for. */
export const PERSPECTIVE_ATTRIBUTES = [
  'TOXICITY',
  'INSULT',
  'PROFANITY',
] as const;

type AnalyzeResponse = {
  attributeScores?: Record<string, { summaryScore?: { value?: number } }>;
};

/**
 * Google Perspective API (`comments:analyze`). Note: its language coverage
 * is narrower than OpenAI's; a language it does not support comes back as
 * an error, which the pipeline treats as "no verdict" (held for review).
 */
export class PerspectiveClassifier extends ToxicityClassifier {
  readonly provider = 'perspective';
  private readonly logger = new Logger(PerspectiveClassifier.name);

  constructor(
    private readonly apiKey: string,
    private readonly fetch: FetchLike,
    private readonly baseUrl = 'https://commentanalyzer.googleapis.com',
  ) {
    super();
  }

  async classify(text: string): Promise<ToxicityResult | null> {
    try {
      const response = await this.fetch(
        `${this.baseUrl}/v1alpha1/comments:analyze?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: { text },
            requestedAttributes: Object.fromEntries(
              PERSPECTIVE_ATTRIBUTES.map((name) => [name, {}]),
            ),
            // Comments are not kept by Google.
            doNotStore: true,
          }),
          signal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.logger.warn({ status: response.status });
        return null;
      }
      const body = (await response.json()) as AnalyzeResponse;
      const categories = Object.fromEntries(
        Object.entries(body.attributeScores ?? {})
          .map(([name, value]) => [name, value.summaryScore?.value])
          .filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
      );
      if (!Object.keys(categories).length) return null;
      return {
        score: maxScore(categories),
        categories,
        provider: this.provider,
      };
    } catch (error) {
      this.logger.warn({ error: (error as Error).name });
      return null;
    }
  }
}
