// A device-local copy of recent chat history, so a room opens instantly and
// survives a reload while offline. The server stays the source of truth: the
// copy is caught up on every open and reconnect, and dropped as soon as the
// server refuses the room (enrollment revoked) or the user signs out.

import { trimRoom } from "./chat-model";
import type { ChatRoomState } from "./types";

const PREFIX = "shanity:chat:";
const VERSION = 1;
/** Messages kept per room on the device. */
export const CHAT_CACHE_MAX_MESSAGES = 200;
/** Older copies are ignored: a full reload is cheaper than a long catch-up. */
export const CHAT_CACHE_TTL_MS = 24 * 60 * 60_000;

type Stored = { v: number; savedAt: number; room: ChatRoomState };

export const chatCacheKey = (userId: string, courseId: string) =>
  `${PREFIX}${userId}:${courseId}`;

export function readChatCache(
  userId: string,
  courseId: string,
  now = Date.now(),
): ChatRoomState | undefined {
  try {
    const raw = window.localStorage.getItem(chatCacheKey(userId, courseId));
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (
      stored.v !== VERSION ||
      typeof stored.savedAt !== "number" ||
      now - stored.savedAt > CHAT_CACHE_TTL_MS ||
      !Array.isArray(stored.room?.messages)
    )
      return undefined;
    return stored.room;
  } catch {
    // Private mode, blocked storage or corrupt JSON: behave as if empty.
    return undefined;
  }
}

export function writeChatCache(
  userId: string,
  courseId: string,
  room: ChatRoomState,
  now = Date.now(),
) {
  try {
    window.localStorage.setItem(
      chatCacheKey(userId, courseId),
      JSON.stringify({
        v: VERSION,
        savedAt: now,
        room: trimRoom(room, CHAT_CACHE_MAX_MESSAGES),
      } satisfies Stored),
    );
  } catch {
    // Quota or blocked storage: chat still works, it just reloads.
  }
}

export function clearChatCache(userId: string, courseId: string) {
  try {
    window.localStorage.removeItem(chatCacheKey(userId, courseId));
  } catch {
    // Nothing to clean up.
  }
}

/** Every room of every account on this device: for sign-out. */
export function clearAllChatCaches() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}
