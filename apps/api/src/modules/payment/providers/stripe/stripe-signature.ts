import { hmacSha256Hex, safeEqual } from '../secrets.js';

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies a `Stripe-Signature` header (https://docs.stripe.com/webhooks).
 * Header: `t=<unix>,v1=<hex>[,v1=<hex>...]`; signed payload: `<t>.<rawBody>`;
 * HMAC-SHA256 with the endpoint's `whsec_` secret. The timestamp must be
 * within the tolerance to stop replays of captured requests.
 */
export function verifyStripeSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
) {
  if (!header || !secret) return false;
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value.toLowerCase());
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0)
    return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const expected = hmacSha256Hex(
    secret,
    Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]),
  );
  return signatures.some((signature) => safeEqual(expected, signature));
}

/** Builds a header for tests and local tooling (same algorithm as Stripe). */
export function signStripePayload(
  rawBody: Buffer | string,
  secret: string,
  timestampSeconds: number,
) {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
  const signature = hmacSha256Hex(
    secret,
    Buffer.concat([Buffer.from(`${timestampSeconds}.`), body]),
  );
  return `t=${timestampSeconds},v1=${signature}`;
}
