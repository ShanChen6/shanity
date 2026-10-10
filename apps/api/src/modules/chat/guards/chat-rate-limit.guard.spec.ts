import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../../../cache/memory-rate-limiter.js';
import {
  CHAT_SEND_LIMIT,
  CHAT_SEND_WINDOW_MS,
  ChatRateLimitGuard,
} from './chat-rate-limit.guard.js';

function context(userId: string, headers: Record<string, string>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ principal: { id: userId } }),
      getResponse: () => ({
        setHeader: (name: string, value: string) => (headers[name] = value),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('ChatRateLimitGuard', () => {
  it('is 5 messages per 3 seconds', () => {
    expect([CHAT_SEND_LIMIT, CHAT_SEND_WINDOW_MS]).toEqual([5, 3000]);
  });

  it('refuses the 6th message in the window with 429 and Retry-After', async () => {
    let now = 0;
    const guard = new ChatRateLimitGuard(new MemoryRateLimiter(100, () => now));
    const headers: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(context('u1', headers))).resolves.toBe(
        true,
      );
      now += 200;
    }
    await expect(
      guard.canActivate(context('u1', headers)),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'CHAT_RATE_LIMITED', retryAfterMs: 2000 },
    });
    expect(headers['Retry-After']).toBe('2');

    // Another user has a budget of their own.
    await expect(guard.canActivate(context('u2', {}))).resolves.toBe(true);
    // And u1 is back once the window has slid past the first message.
    now = 3001;
    await expect(guard.canActivate(context('u1', {}))).resolves.toBe(true);
  });
});
