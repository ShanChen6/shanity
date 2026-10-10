"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { chatKeys, fetchChatPage, type ChatPageFetcher } from "./api";
import { clearChatCache, readChatCache, writeChatCache } from "./chat-cache";
import {
  markHidden,
  mergeMessages,
  OLDER_PAGE_SIZE,
  syncRoom,
} from "./chat-model";
import type { ChatMessage, ChatRoomState } from "./types";

type Options = { fetcher?: ChatPageFetcher };

/** The server refused the room: not (or no longer) a member, or no course. */
const isRefused = (error: unknown) =>
  error instanceof ApiError && (error.status === 403 || error.status === 404);

/**
 * One course's chat history, oldest first.
 *
 * - Opens from the device copy (localStorage) at once, then catches up.
 * - Catches up again, fetching only what was missed, whenever the browser
 *   comes back online or the tab regains focus. Call `sync()` when the
 *   real-time connection reconnects: a socket can drop while the browser
 *   stays online.
 * - `receive()` merges a message pushed over the real-time channel, and
 *   `hide()` applies a `message_hidden` event.
 * - A refusal from the server (enrollment revoked) wipes the device copy.
 */
export function useChatMessages(
  userId: string,
  courseId: string,
  { fetcher = fetchChatPage }: Options = {},
) {
  const client = useQueryClient();
  const key = useMemo(() => chatKeys.room(userId, courseId), [userId, courseId]);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      syncRoom(
        courseId,
        client.getQueryData<ChatRoomState>(key),
        () => client.getQueryData<ChatRoomState>(key),
        fetcher,
        signal,
      ),
    initialData: () => readChatCache(userId, courseId),
    // The device copy is shown, but always counts as stale: catch up at once.
    initialDataUpdatedAt: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: (count, error) => !isRefused(error) && count < 3,
  });

  const refused = isRefused(query.error);
  useEffect(() => {
    // The in-memory copy is kept but no longer shown (removing the query
    // would only re-create it and ask again); the device copy goes now.
    if (refused) clearChatCache(userId, courseId);
    else if (query.data) writeChatCache(userId, courseId, query.data);
  }, [courseId, userId, query.data, refused]);

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<unknown>(null);
  const room = refused ? undefined : query.data;
  const oldest = room?.messages[0];
  const canLoadOlder = Boolean(room?.hasOlder && oldest) && !loadingOlder;

  const loadOlder = useCallback(async () => {
    if (!canLoadOlder || !oldest) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await fetcher(courseId, {
        cursor: oldest.cursor,
        limit: OLDER_PAGE_SIZE,
      });
      client.setQueryData<ChatRoomState>(key, (current) =>
        current
          ? {
              messages: mergeMessages(current.messages, page.messages),
              hasOlder: page.hasMore,
            }
          : current,
      );
    } catch (error) {
      setOlderError(error);
    } finally {
      setLoadingOlder(false);
    }
  }, [canLoadOlder, oldest, fetcher, courseId, client, key]);

  const receive = useCallback(
    (message: ChatMessage) =>
      client.setQueryData<ChatRoomState>(key, (current) => ({
        messages: mergeMessages(current?.messages ?? [], [message]),
        hasOlder: current?.hasOlder ?? true,
      })),
    [client, key],
  );

  const hide = useCallback(
    (messageId: string, options?: { keepContent?: boolean }) =>
      client.setQueryData<ChatRoomState>(key, (current) =>
        current ? markHidden(current, messageId, options) : current,
      ),
    [client, key],
  );

  const { refetch } = query;
  const sync = useCallback(() => void refetch(), [refetch]);

  return {
    messages: room?.messages ?? [],
    hasOlder: Boolean(room?.hasOlder),
    /** Catching up with the server (the held messages stay on screen). */
    isSyncing: query.isFetching,
    /** No member of this room (403/404): show the access state, not the chat. */
    refused,
    error: refused ? null : query.error,
    loadOlder,
    loadingOlder,
    olderError,
    receive,
    hide,
    sync,
  };
}
