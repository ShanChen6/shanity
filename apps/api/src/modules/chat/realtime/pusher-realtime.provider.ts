import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Pusher from 'pusher';
import {
  RealtimeProvider,
  type ChatMember,
  type RealtimeChannelAuth,
} from './realtime-provider.js';

export type PusherConfig = {
  appId: string;
  key: string;
  secret: string;
  cluster: string;
};

/** Null while Pusher is not configured (real-time chat is then unavailable). */
export function pusherConfig(
  env: NodeJS.ProcessEnv = process.env,
): PusherConfig | null {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = env;
  return PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
    ? {
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY,
        secret: PUSHER_SECRET,
        cluster: PUSHER_CLUSTER,
      }
    : null;
}

@Injectable()
export class PusherRealtimeProvider extends RealtimeProvider {
  private client: Pusher | null = null;

  isAvailable() {
    return pusherConfig() !== null;
  }

  authorizePresenceChannel(
    socketId: string,
    channel: string,
    member: ChatMember,
  ): RealtimeChannelAuth {
    const { id, ...info } = member;
    return this.pusher().authorizeChannel(socketId, channel, {
      user_id: id,
      user_info: info,
    });
  }

  async publish(channel: string, event: string, data: unknown) {
    await this.pusher().trigger(channel, event, data);
  }

  // Built on first use so the API boots (and tests run) without credentials.
  private pusher() {
    if (this.client) return this.client;
    const config = pusherConfig();
    if (!config)
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'CHAT_REALTIME_UNAVAILABLE',
        code: 'CHAT_REALTIME_UNAVAILABLE',
      });
    this.client = new Pusher({ ...config, useTLS: true });
    return this.client;
  }
}
