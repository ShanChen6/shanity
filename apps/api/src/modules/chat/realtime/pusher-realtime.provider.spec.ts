import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { courseChannel, courseIdFromChannel } from '../chat-channels.js';
import {
  PusherRealtimeProvider,
  pusherConfig,
} from './pusher-realtime.provider.js';

const ENV = {
  PUSHER_APP_ID: '1',
  PUSHER_KEY: 'key',
  PUSHER_SECRET: 'secret',
  PUSHER_CLUSTER: 'ap1',
};
const COURSE = '3f0c1a52-8d4e-4b7a-9c1d-2e5f6a7b8c9d';

describe('pusher realtime provider', () => {
  afterEach(() => {
    for (const name of Object.keys(ENV)) delete process.env[name];
  });

  it('is unconfigured unless all four variables are set', () => {
    expect(pusherConfig({ PUSHER_KEY: 'key' })).toBeNull();
    expect(pusherConfig(ENV)).toEqual({
      appId: '1',
      key: 'key',
      secret: 'secret',
      cluster: 'ap1',
    });
  });

  it('signs socket:channel:channel_data with the app secret', () => {
    Object.assign(process.env, ENV);
    const channel = courseChannel(COURSE);
    const result = new PusherRealtimeProvider().authorizePresenceChannel(
      '123.456',
      channel,
      { id: 'u1', name: 'An', avatarUrl: null, role: 'student' },
    );

    expect(JSON.parse(result.channel_data!)).toEqual({
      user_id: 'u1',
      user_info: { name: 'An', avatarUrl: null, role: 'student' },
    });
    // Pusher's documented scheme, computed independently of the SDK.
    const signature = createHmac('sha256', 'secret')
      .update(`123.456:${channel}:${result.channel_data}`)
      .digest('hex');
    expect(result.auth).toBe(`key:${signature}`);
  });

  it('refuses to sign while unconfigured', () => {
    const provider = new PusherRealtimeProvider();
    expect(provider.isAvailable()).toBe(false);
    expect(() =>
      provider.authorizePresenceChannel('1.2', courseChannel(COURSE), {
        id: 'u1',
        name: 'An',
        avatarUrl: null,
        role: 'student',
      }),
    ).toThrow('CHAT_REALTIME_UNAVAILABLE');
  });
});

describe('course chat channels', () => {
  it('round-trips a course id', () => {
    expect(courseIdFromChannel(courseChannel(COURSE))).toBe(COURSE);
  });

  it('rejects every other channel name', () => {
    for (const name of [
      `private-course-${COURSE}`,
      `presence-course-${COURSE.toUpperCase()}`,
      `presence-course-${COURSE}-x`,
      `presence-course-not-a-uuid`,
      `presence-course-${COURSE}\n`,
    ])
      expect(courseIdFromChannel(name), name).toBeNull();
  });
});
