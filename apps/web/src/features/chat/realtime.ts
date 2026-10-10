"use client";

import Pusher from "pusher-js";
import { api } from "@/lib/api";

// Literal property access: Next inlines NEXT_PUBLIC_* only when written out.
const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

export const realtimeConfigured = Boolean(KEY && CLUSTER);

/** What POST /api/v1/chat/auth returns: Pusher's own signed payload. */
type ChannelAuthorization = { auth: string; channel_data?: string };

let client: Pusher | null = null;

/**
 * The tab's one Pusher connection, or null while real-time chat is not
 * configured (the room then catches up by polling). Channel access is
 * signed by POST /api/v1/chat/auth through the app's own API client, so the
 * session cookie, origin check and silent token refresh all apply.
 */
export function realtimeClient(): Pusher | null {
  if (!KEY || !CLUSTER || typeof window === "undefined") return null;
  client ??= new Pusher(KEY, {
    cluster: CLUSTER,
    forceTLS: true,
    channelAuthorization: {
      customHandler: ({ socketId, channelName }, callback) => {
        api<ChannelAuthorization>("/api/v1/chat/auth", {
          method: "POST",
          body: JSON.stringify({
            socket_id: socketId,
            channel_name: channelName,
          }),
        }).then(
          (data) => callback(null, data),
          (error: unknown) =>
            callback(error instanceof Error ? error : new Error("auth"), null),
        );
      },
    },
  });
  return client;
}

export const courseChannelName = (courseId: string) =>
  `presence-course-${courseId}`;
