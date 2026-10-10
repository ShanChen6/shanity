/** What other members of a presence channel see about a connected user. */
export interface ChatMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** The user's standing in this course's room: teaching it, or learning. */
  role: 'instructor' | 'student';
}

/** The signed payload the client SDK expects back from the auth endpoint. */
export interface RealtimeChannelAuth {
  auth: string;
  channel_data?: string;
}

/**
 * The hosted real-time service (Pusher today; Ably fits the same shape). The
 * API never holds sockets itself, which keeps it deployable on serverless
 * runtimes: clients connect to the provider, the API only signs channel
 * access and publishes events over the provider's REST API.
 *
 * Abstract class rather than interface so it doubles as the Nest DI token.
 */
export abstract class RealtimeProvider {
  /** False while the provider's credentials are not configured. */
  abstract isAvailable(): boolean;

  /** Signs `socketId`'s subscription to presence `channel` as `member`. */
  abstract authorizePresenceChannel(
    socketId: string,
    channel: string,
    member: ChatMember,
  ): RealtimeChannelAuth;

  /** Broadcasts `event` with `data` to everyone subscribed to `channel`. */
  abstract publish(
    channel: string,
    event: string,
    data: unknown,
  ): Promise<void>;
}
