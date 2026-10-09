import { api } from "@/lib/api";
import type { ChatHistoryPage } from "./types";

const enc = encodeURIComponent;

export const chatKeys = {
  // Per user as well as per course: one browser can be shared by two accounts.
  room: (userId: string, courseId: string) =>
    ["chat", "room", userId, courseId] as const,
};

export type ChatPageQuery = {
  /** Older than this message. */
  cursor?: string;
  /** Newer than this message. */
  after?: string;
  limit?: number;
};

export function fetchChatPage(
  courseId: string,
  { cursor, after, limit }: ChatPageQuery = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  if (after) query.set("after", after);
  if (limit) query.set("limit", String(limit));
  const suffix = query.size ? `?${query}` : "";
  return api<ChatHistoryPage>(
    `/api/v1/courses/${enc(courseId)}/chat/messages${suffix}`,
    { signal },
  );
}

export type ChatPageFetcher = typeof fetchChatPage;

/** Events the API publishes on `presence-course-<courseId>`. */
export const ChatEvents = {
  MESSAGE_HIDDEN: "message_hidden",
  USER_MUTED: "user_muted",
} as const;
export type MessageHiddenEvent = { messageId: string };
export type UserMutedEvent = { userId: string; mutedUntil: string };

const write = <T>(method: "POST" | "PATCH", path: string, body: object) =>
  api<T>(path, { method, body: JSON.stringify(body) });

/** A member flags a message for moderators. 409 if already reported. */
export const reportChatMessage = (messageId: string, reason: string) =>
  write<{ reportId: string; messageId: string; status: "PENDING" }>(
    "POST",
    `/api/v1/chat/messages/${enc(messageId)}/report`,
    { reason },
  );

/** Course teachers and admins: hide for learners, resolve its reports. */
export const hideChatMessage = (messageId: string, reason?: string) =>
  write<{ messageId: string; status: "HIDDEN"; resolvedReports: number }>(
    "PATCH",
    `/api/v1/chat/messages/${enc(messageId)}/hide`,
    reason ? { reason } : {},
  );

/** Course teachers and admins: suspend a learner's sending in one course. */
export const muteChatUser = (
  userId: string,
  courseId: string,
  durationMinutes: number,
  reason?: string,
) =>
  write<UserMutedEvent & { courseId: string }>(
    "POST",
    `/api/v1/chat/users/${enc(userId)}/mute`,
    { courseId, durationMinutes, ...(reason ? { reason } : {}) },
  );
