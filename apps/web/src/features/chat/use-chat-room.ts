"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  chatKeys,
  fetchChatMe,
  sendChatMessage,
  type ChatPageFetcher,
} from "./api";
import { useChatMessages } from "./use-chat-messages";
import { useCourseChannel } from "./use-course-channel";

/** Without a live connection the room catches up on this period instead. */
export const POLL_WHILE_OFFLINE_MS = 15_000;

const later = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

/**
 * Everything one course chat room needs: history (cached, caught up on
 * reconnect), the live channel, the caller's role and mute, and sending.
 */
export function useChatRoom(
  userId: string,
  courseId: string,
  options: { fetcher?: ChatPageFetcher } = {},
) {
  const history = useChatMessages(userId, courseId, options);
  const meQuery = useQuery({
    queryKey: chatKeys.me(userId, courseId),
    queryFn: ({ signal }) => fetchChatMe(courseId, signal),
    retry: false,
  });
  // Mutes learnt since the last read of /me (event, or a refused send).
  const [mutedLocally, setMutedLocally] = useState<string | null>(null);

  const { receive, hide, sync } = history;
  const isModerator = meQuery.data?.role === "instructor";
  const { status, realtime } = useCourseChannel(courseId, {
    onMessage: receive,
    // Moderators keep the text (they may read hidden messages).
    onHidden: ({ messageId }) => hide(messageId, { keepContent: isModerator }),
    onMuted: (event) => {
      if (event.userId === userId) setMutedLocally(event.mutedUntil);
    },
    onReconnect: sync,
  });

  useEffect(() => {
    if (status === "connected") return;
    const timer = window.setInterval(sync, POLL_WHILE_OFFLINE_MS);
    return () => window.clearInterval(timer);
  }, [status, sync]);

  const mutedUntil = useMuteDeadline(
    later(meQuery.data?.mutedUntil ?? null, mutedLocally),
  );

  const send = useMutation({
    mutationFn: (content: string) => sendChatMessage(courseId, content),
    onSuccess: (message) => receive(message),
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === "CHAT_MUTED" &&
        typeof error.data.mutedUntil === "string"
      )
        setMutedLocally(error.data.mutedUntil);
    },
  });

  return {
    ...history,
    role: meQuery.data?.role ?? null,
    isModerator,
    mutedUntil,
    status,
    realtime,
    send,
  };
}

/** The deadline while it lies ahead; null once it passes (re-renders then). */
function useMuteDeadline(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now());
  const until = useMemo(() => (deadline ? Date.parse(deadline) : 0), [deadline]);
  const tick = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    if (!until || until <= Date.now()) return;
    // setTimeout caps near 24.8 days; longer mutes re-arm on the next render.
    const timer = window.setTimeout(tick, Math.min(until - Date.now(), 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [until, tick]);
  return until > now ? deadline : null;
}
