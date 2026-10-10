import { describe, expect, it, vi } from 'vitest';
import { CommentStatus } from '../entities/post-comment.entity.js';
import {
  classifierFromEnv,
  UnavailableClassifier,
} from './classifier.factory.js';
import { CommentRules, DEFAULT_ALLOWED_HOSTS } from './comment-rules.js';
import {
  CommentModerationService,
  NEW_ACCOUNT_MS,
  isTrusted,
  toxicityBand,
  type CommenterProfile,
} from './comment-moderation.service.js';
import { OpenAiModerationClassifier } from './openai-moderation.classifier.js';
import { PerspectiveClassifier } from './perspective.classifier.js';
import {
  ToxicityClassifier,
  type ToxicityResult,
} from './toxicity-classifier.js';

/** A classifier that answers whatever score the scenario needs. */
class FakeClassifier extends ToxicityClassifier {
  readonly provider = 'fake';
  calls: string[] = [];
  constructor(private readonly score: number | null) {
    super();
  }
  classify(text: string): Promise<ToxicityResult | null> {
    this.calls.push(text);
    return Promise.resolve(
      this.score === null
        ? null
        : {
            score: this.score,
            categories: { harassment: this.score },
            provider: 'fake',
          },
    );
  }
}

const rules = new CommentRules({
  allowedHosts: DEFAULT_ALLOWED_HOSTS,
  blockedTerms: [],
});
const DAY = NEW_ACCOUNT_MS;
const student = (extra: Partial<CommenterProfile> = {}): CommenterProfile => ({
  roles: ['student'],
  accountAgeMs: 30 * DAY,
  enrolled: true,
  approvedComments: 0,
  duplicate: false,
  ...extra,
});
const run = (
  score: number | null,
  profile: CommenterProfile,
  text = 'Bài viết rất hay, cảm ơn tác giả!',
) => {
  const classifier = new FakeClassifier(score);
  const service = new CommentModerationService(rules, classifier);
  return { classifier, decision: service.moderate(text, profile) };
};

describe('toxicity bands', () => {
  it('splits at 0.3 and 0.7, both boundaries suspicious', () => {
    expect(toxicityBand(0)).toBe('CLEAN');
    expect(toxicityBand(0.299)).toBe('CLEAN');
    expect(toxicityBand(0.3)).toBe('SUSPICIOUS');
    expect(toxicityBand(0.7)).toBe('SUSPICIOUS');
    expect(toxicityBand(0.701)).toBe('TOXIC');
  });
});

describe('trust', () => {
  it('trusts teachers, enrolled learners and proven commenters, not new accounts', () => {
    expect(isTrusted(student())).toBe(true);
    expect(isTrusted(student({ enrolled: false, approvedComments: 4 }))).toBe(
      true,
    );
    expect(isTrusted(student({ enrolled: false, approvedComments: 3 }))).toBe(
      false,
    );
    expect(isTrusted(student({ accountAgeMs: DAY - 1 }))).toBe(false);
    expect(
      isTrusted(
        student({ roles: ['instructor'], accountAgeMs: 0, enrolled: false }),
      ),
    ).toBe(true);
  });
});

describe('CommentModerationService pipeline', () => {
  it('AC1: a clean comment from a trusted learner is approved at once', async () => {
    const { decision } = run(0.02, student());
    expect(await decision).toMatchObject({
      status: CommentStatus.APPROVED,
      toxicityScore: 0.02,
      reason: null,
      record: { decidedBy: 'trust', provider: 'fake' },
    });
  });

  it('AC2: profanity and junk links stop at layer 1, before any AI call', async () => {
    for (const [text, reason] of [
      ['bài như lồn', 'PROFANITY'],
      ['tài liệu rẻ tại https://re-qua.xyz', 'SPAM_LINK'],
      ['zalo 0912345678 nhé', 'CONTACT_INFO'],
    ] as const) {
      const { classifier, decision } = run(0.01, student(), text);
      expect(await decision).toMatchObject({
        status: CommentStatus.REJECTED,
        reason,
        record: { decidedBy: 'rules' },
      });
      expect(classifier.calls).toEqual([]);
    }
  });

  it('AC2: a toxic score above 0.7 is rejected, even from a teacher', async () => {
    const { decision } = run(0.93, student({ roles: ['instructor'] }));
    expect(await decision).toMatchObject({
      status: CommentStatus.REJECTED,
      reason: 'TOXIC',
      toxicityScore: 0.93,
    });
  });

  it('AC3: a borderline score waits for an admin, whoever wrote it', async () => {
    for (const score of [0.3, 0.5, 0.7]) {
      const { decision } = run(score, student({ roles: ['admin'] }));
      expect(await decision).toMatchObject({
        status: CommentStatus.PENDING,
        reason: 'SUSPICIOUS',
      });
    }
  });

  it('holds a clean comment from a new or unknown account', async () => {
    for (const profile of [
      student({ accountAgeMs: 60_000 }),
      student({ enrolled: false, approvedComments: 0 }),
    ]) {
      const { decision } = run(0.01, profile);
      expect(await decision).toMatchObject({
        status: CommentStatus.PENDING,
        reason: 'UNTRUSTED_AUTHOR',
      });
    }
  });

  it('never approves without an AI verdict', async () => {
    const { decision } = run(null, student({ roles: ['admin'] }));
    expect(await decision).toMatchObject({
      status: CommentStatus.PENDING,
      reason: 'AI_UNAVAILABLE',
      toxicityScore: null,
    });
  });

  it('rejects a repeat of the same comment without asking the AI', async () => {
    const { classifier, decision } = run(0.01, student({ duplicate: true }));
    expect(await decision).toMatchObject({
      status: CommentStatus.REJECTED,
      reason: 'DUPLICATE',
    });
    expect(classifier.calls).toEqual([]);
  });
});

describe('classifier adapters', () => {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

  it('OpenAI: scores by the highest category and sends the model', async () => {
    const fetch = vi.fn(() =>
      json({
        results: [
          { category_scores: { harassment: 0.12, hate: 0.4, violence: 0.05 } },
        ],
      }),
    );
    const result = await new OpenAiModerationClassifier(
      'sk-test',
      fetch,
    ).classify('x');
    expect(result).toMatchObject({ score: 0.4, provider: 'openai' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/moderations');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'omni-moderation-latest',
      input: 'x',
    });
  });

  it('Perspective: reads summary scores and asks Google not to store', async () => {
    const fetch = vi.fn(() =>
      json({
        attributeScores: {
          TOXICITY: { summaryScore: { value: 0.81 } },
          INSULT: { summaryScore: { value: 0.6 } },
        },
      }),
    );
    const result = await new PerspectiveClassifier('key', fetch).classify('x');
    expect(result).toMatchObject({ score: 0.81, provider: 'perspective' });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ doNotStore: true });
  });

  it('answers "no verdict" on errors, timeouts and unsupported languages', async () => {
    for (const fetch of [
      vi.fn(() =>
        json(
          { error: { message: 'LANGUAGE_NOT_SUPPORTED_BY_ATTRIBUTE' } },
          400,
        ),
      ),
      vi.fn(() => Promise.reject(new DOMException('timeout', 'TimeoutError'))),
      vi.fn(() => json({ results: [] })),
    ]) {
      expect(
        await new OpenAiModerationClassifier('k', fetch).classify('x'),
      ).toBeNull();
      expect(
        await new PerspectiveClassifier('k', fetch).classify('x'),
      ).toBeNull();
    }
  });

  it('picks the provider from the environment, unavailable without a key', () => {
    const fetch = vi.fn();
    expect(classifierFromEnv(fetch, {})).toBeInstanceOf(UnavailableClassifier);
    expect(classifierFromEnv(fetch, { OPENAI_API_KEY: 'k' })).toBeInstanceOf(
      OpenAiModerationClassifier,
    );
    expect(
      classifierFromEnv(fetch, {
        COMMENT_MODERATION_PROVIDER: 'perspective',
        PERSPECTIVE_API_KEY: 'k',
      }),
    ).toBeInstanceOf(PerspectiveClassifier);
    expect(
      classifierFromEnv(fetch, { COMMENT_MODERATION_PROVIDER: 'perspective' }),
    ).toBeInstanceOf(UnavailableClassifier);
  });
});
