import { Logger } from '@nestjs/common';
import {
  CLASSIFIER_TIMEOUT_MS,
  maxScore,
  ToxicityClassifier,
  type FetchLike,
  type ToxicityResult,
} from './toxicity-classifier.js';

type ModerationResponse = {
  results?: Array<{ category_scores?: Record<string, number> }>;
};

/**
 * OpenAI Moderation (`POST /v1/moderations`, free of charge, multilingual
 * including Vietnamese). Its categories (harassment, hate, sexual,
 * violence, ...) are folded into one toxicity score: the highest of them.
 */
export class OpenAiModerationClassifier extends ToxicityClassifier {
  readonly provider = 'openai';
  private readonly logger = new Logger(OpenAiModerationClassifier.name);

  constructor(
    private readonly apiKey: string,
    private readonly fetch: FetchLike,
    private readonly model = 'omni-moderation-latest',
    private readonly baseUrl = 'https://api.openai.com',
  ) {
    super();
  }

  async classify(text: string): Promise<ToxicityResult | null> {
    try {
      const response = await this.fetch(`${this.baseUrl}/v1/moderations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: this.model, input: text }),
        signal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status });
        return null;
      }
      const body = (await response.json()) as ModerationResponse;
      const categories = body.results?.[0]?.category_scores;
      if (!categories || !Object.keys(categories).length) return null;
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
