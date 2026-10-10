import { Injectable } from '@nestjs/common';
import {
  CommentStatus,
  type CommentModerationRecord,
} from '../entities/post-comment.entity.js';
import { CommentRules, type RuleCode } from './comment-rules.js';
import { ToxicityClassifier } from './toxicity-classifier.js';

/** Below this the AI calls a comment clean. */
export const CLEAN_BELOW = 0.3;
/** Above this it is toxic; in between, suspicious. */
export const TOXIC_ABOVE = 0.7;
/** Accounts younger than this are new, whatever else they have. */
export const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;
/** Approved comments that make an account trusted on their own. */
export const TRUSTED_AFTER_APPROVED = 3;

/** What layer 3 knows about the commenter. */
export interface CommenterProfile {
  roles: readonly string[];
  accountAgeMs: number;
  /** Has at least one active (not revoked) enrollment. */
  enrolled: boolean;
  approvedComments: number;
  /** Already posted this exact text on this post recently. */
  duplicate: boolean;
}

export type ModerationReason =
  | RuleCode
  | 'DUPLICATE'
  | 'TOXIC'
  | 'SUSPICIOUS'
  | 'AI_UNAVAILABLE'
  | 'UNTRUSTED_AUTHOR';

export interface ModerationDecision {
  status: CommentStatus;
  toxicityScore: number | null;
  /** Why it is not APPROVED; null when it is. */
  reason: ModerationReason | null;
  record: CommentModerationRecord;
}

export type ToxicityBand = 'CLEAN' | 'SUSPICIOUS' | 'TOXIC';

/** score < 0.3 clean; 0.3..0.7 (inclusive) suspicious; > 0.7 toxic. */
export function toxicityBand(score: number): ToxicityBand {
  if (score < CLEAN_BELOW) return 'CLEAN';
  if (score > TOXIC_ABOVE) return 'TOXIC';
  return 'SUSPICIOUS';
}

/**
 * Teachers and admins are trusted. So is any account past its first day
 * that either learns here (an active enrollment) or has more than three
 * approved comments. Everyone else (new or unknown accounts) is not.
 */
export function isTrusted(profile: CommenterProfile) {
  if (profile.roles.some((role) => role === 'instructor' || role === 'admin'))
    return true;
  if (profile.accountAgeMs < NEW_ACCOUNT_MS) return false;
  return profile.enrolled || profile.approvedComments > TRUSTED_AFTER_APPROVED;
}

/**
 * The three-layer comment pipeline. Every layer can only make the outcome
 * stricter, and when a layer cannot decide (the AI is unreachable) the
 * comment waits for a person rather than being let through:
 *
 *  1. rules (links, contact details, profanity, repetition): REJECTED;
 *  2. AI toxicity: > 0.7 REJECTED, 0.3..0.7 PENDING, no answer PENDING;
 *  3. trust: a clean comment from a trusted author is APPROVED at once,
 *     from anyone else PENDING.
 */
@Injectable()
export class CommentModerationService {
  constructor(
    private readonly rules: CommentRules,
    private readonly classifier: ToxicityClassifier,
  ) {}

  async moderate(
    content: string,
    profile: CommenterProfile,
  ): Promise<ModerationDecision> {
    const trust = {
      trusted: isTrusted(profile),
      enrolled: profile.enrolled,
      approvedComments: profile.approvedComments,
      accountAgeHours: Math.floor(profile.accountAgeMs / 3_600_000),
    };

    // Layer 1: local, instant, and free; nothing leaves the server.
    if (profile.duplicate)
      return reject('DUPLICATE', null, {
        decidedBy: 'rules',
        rule: 'DUPLICATE',
      });
    const violation = this.rules.check(content);
    if (violation)
      return reject(violation.rule, null, {
        decidedBy: 'rules',
        rule: violation.rule,
      });

    // Layer 2.
    const result = await this.classifier.classify(content);
    if (!result)
      return {
        status: CommentStatus.PENDING,
        toxicityScore: null,
        reason: 'AI_UNAVAILABLE',
        record: { decidedBy: 'ai', provider: this.classifier.provider, trust },
      };
    const ai = {
      provider: result.provider,
      categories: result.categories,
      trust,
    };
    const band = toxicityBand(result.score);
    if (band === 'TOXIC')
      return reject('TOXIC', result.score, { decidedBy: 'ai', ...ai });
    if (band === 'SUSPICIOUS')
      return {
        status: CommentStatus.PENDING,
        toxicityScore: result.score,
        reason: 'SUSPICIOUS',
        record: { decidedBy: 'ai', ...ai },
      };

    // Layer 3.
    return trust.trusted
      ? {
          status: CommentStatus.APPROVED,
          toxicityScore: result.score,
          reason: null,
          record: { decidedBy: 'trust', ...ai },
        }
      : {
          status: CommentStatus.PENDING,
          toxicityScore: result.score,
          reason: 'UNTRUSTED_AUTHOR',
          record: { decidedBy: 'trust', ...ai },
        };
  }
}

function reject(
  reason: ModerationReason,
  score: number | null,
  record: CommentModerationRecord,
): ModerationDecision {
  return {
    status: CommentStatus.REJECTED,
    toxicityScore: score,
    reason,
    record,
  };
}
