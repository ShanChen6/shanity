import { describe, expect, it } from 'vitest';
import {
  signStripePayload,
  verifyStripeSignature,
} from './stripe-signature.js';

const secret = 'whsec_test_secret';
const body = Buffer.from('{"id":"evt_1","type":"checkout.session.completed"}');
const now = 1_790_000_000;

describe('verifyStripeSignature', () => {
  it('accepts a correctly signed, fresh payload', () => {
    const header = signStripePayload(body, secret, now);
    expect(verifyStripeSignature(body, header, secret, now)).toBe(true);
    expect(verifyStripeSignature(body, header, secret, now + 299)).toBe(true);
  });

  it('matches Stripe documented test vector shape (t=, v1=)', () => {
    const header = signStripePayload(body, secret, now);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('accepts any matching v1 among several (key rotation)', () => {
    const good = signStripePayload(body, secret, now).split(',v1=')[1]!;
    const header = `t=${now},v1=${'0'.repeat(64)},v0=ignored,v1=${good}`;
    expect(verifyStripeSignature(body, header, secret, now)).toBe(true);
  });

  it.each([['a tampered body', Buffer.from('{"id":"evt_1","type":"x"}')]])(
    'rejects %s',
    (_label, tampered) => {
      const header = signStripePayload(body, secret, now);
      expect(verifyStripeSignature(tampered, header, secret, now)).toBe(false);
    },
  );

  it('rejects a wrong secret, stale or future timestamps and malformed headers', () => {
    const header = signStripePayload(body, secret, now);
    expect(verifyStripeSignature(body, header, 'whsec_other', now)).toBe(false);
    expect(verifyStripeSignature(body, header, secret, now + 301)).toBe(false);
    expect(verifyStripeSignature(body, header, secret, now - 301)).toBe(false);
    for (const bad of [
      undefined,
      '',
      'garbage',
      `t=${now}`,
      `v1=${'a'.repeat(64)}`,
      `t=abc,v1=${'a'.repeat(64)}`,
      `t=${now},v1=short`,
    ])
      expect(verifyStripeSignature(body, bad, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, header, '', now)).toBe(false);
  });

  it('binds the timestamp into the signature (no timestamp swapping)', () => {
    const header = signStripePayload(body, secret, now - 10);
    const swapped = header.replace(`t=${now - 10}`, `t=${now}`);
    expect(verifyStripeSignature(body, swapped, secret, now)).toBe(false);
  });
});
