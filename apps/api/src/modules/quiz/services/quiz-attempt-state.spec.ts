import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { QuizAttemptStatus as S } from '../entities/quiz-attempt.entity.js';
import {
  assertTransition,
  canTransition,
  isScoreConcealed,
} from './quiz-attempt-state.js';

describe('quiz attempt state machine', () => {
  it('allows the submission pipeline transitions', () => {
    expect(canTransition(S.IN_PROGRESS, S.SUBMITTING)).toBe(true);
    expect(canTransition(S.SUBMITTING, S.COMPLETED)).toBe(true);
    expect(canTransition(S.SUBMITTING, S.NEEDS_GRADING)).toBe(true);
    expect(canTransition(S.NEEDS_GRADING, S.COMPLETED)).toBe(true);
    expect(canTransition(S.IN_PROGRESS, S.TIMED_OUT)).toBe(true);
  });

  it('never goes back to IN_PROGRESS and never skips grading', () => {
    for (const from of Object.values(S))
      expect(canTransition(from, S.IN_PROGRESS)).toBe(false);
    expect(() => assertTransition(S.COMPLETED, S.IN_PROGRESS)).toThrow(
      BadRequestException,
    );
    expect(() => assertTransition(S.COMPLETED, S.NEEDS_GRADING)).toThrow(
      BadRequestException,
    );
    // An attempt cannot jump to COMPLETED without being claimed first.
    expect(canTransition(S.IN_PROGRESS, S.COMPLETED)).toBe(false);
    expect(canTransition(S.NEEDS_GRADING, S.SUBMITTING)).toBe(false);
  });

  it('reports a machine-readable code', () => {
    let thrown: unknown;
    try {
      assertTransition(S.COMPLETED, S.IN_PROGRESS);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('conceals scores only while essays await grading', () => {
    expect(isScoreConcealed(S.NEEDS_GRADING)).toBe(true);
    for (const status of [S.COMPLETED, S.TIMED_OUT, S.IN_PROGRESS])
      expect(isScoreConcealed(status)).toBe(false);
  });
});
