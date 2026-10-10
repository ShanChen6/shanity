import { OpenAiModerationClassifier } from './openai-moderation.classifier.js';
import { PerspectiveClassifier } from './perspective.classifier.js';
import { ToxicityClassifier, type FetchLike } from './toxicity-classifier.js';

/** No provider configured: every comment that reaches layer 2 is held. */
export class UnavailableClassifier extends ToxicityClassifier {
  readonly provider = 'none';
  classify() {
    return Promise.resolve(null);
  }
}

/**
 * COMMENT_MODERATION_PROVIDER = openai (default) | perspective, with
 * OPENAI_API_KEY or PERSPECTIVE_API_KEY. Missing key: unavailable.
 */
export function classifierFromEnv(
  fetch: FetchLike,
  env: NodeJS.ProcessEnv = process.env,
): ToxicityClassifier {
  const provider = (env.COMMENT_MODERATION_PROVIDER ?? 'openai').trim();
  if (provider === 'perspective' && env.PERSPECTIVE_API_KEY)
    return new PerspectiveClassifier(env.PERSPECTIVE_API_KEY, fetch);
  if (provider === 'openai' && env.OPENAI_API_KEY)
    return new OpenAiModerationClassifier(
      env.OPENAI_API_KEY,
      fetch,
      env.OPENAI_MODERATION_MODEL || undefined,
    );
  return new UnavailableClassifier();
}
