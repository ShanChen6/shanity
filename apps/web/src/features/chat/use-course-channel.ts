"use client";

import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { ChatEvents, type MessageHiddenEvent, type UserMutedEvent } from "./api";
import {
  connectionStatus,
  type ConnectionStatus,
} from "./connection-status";
import { courseChannelName, realtimeClient } from "./realtime";
import type { ChatMessage } from "./types";

export type ChannelHandlers = {
  onMessage: (message: ChatMessage) => void;
  onHidden: (event: MessageHiddenEvent) => void;
  onMuted: (event: UserMutedEvent) => void;
  /** Back after a drop: fetch whatever was sent meanwhile. */
  onReconnect: () => void;
};

/**
 * Joins `presence-course-<courseId>` and reports the connection as the
 * room's badge shows it. Handlers may change on every render; the
 * subscription does not.
 */
export function useCourseChannel(
  courseId: string,
  handlers: ChannelHandlers,
): { status: ConnectionStatus; realtime: boolean } {
  const online = useOnlineStatus();
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const client = realtimeClient();
  const [state, setState] = useState(
    () => client?.connection.state ?? "initialized",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [everConnected, setEverConnected] = useState(false);

  useEffect(() => {
    if (!client) return;
    const connection = client.connection;
    let wasSubscribed = false;
    const onState = ({ current }: { current: string }) => {
      setState(current);
      if (current !== "connected") setSubscribed(false);
    };
    connection.bind("state_change", onState);

    const channel = client.subscribe(courseChannelName(courseId));
    channel.bind("pusher:subscription_succeeded", () => {
      setSubscribed(true);
      setEverConnected(true);
      // Every subscription after the first follows a drop: catch up.
      if (wasSubscribed) latest.current.onReconnect();
      wasSubscribed = true;
    });
    channel.bind("pusher:subscription_error", () => setSubscribed(false));
    channel.bind(ChatEvents.MESSAGE_CREATED, (message: ChatMessage) =>
      latest.current.onMessage(message),
    );
    channel.bind(ChatEvents.MESSAGE_HIDDEN, (event: MessageHiddenEvent) =>
      latest.current.onHidden(event),
    );
    channel.bind(ChatEvents.USER_MUTED, (event: UserMutedEvent) =>
      latest.current.onMuted(event),
    );
    return () => {
      connection.unbind("state_change", onState);
      channel.unbind_all();
      client.unsubscribe(courseChannelName(courseId));
    };
  }, [client, courseId]);

  if (!client) return { status: "disconnected", realtime: false };
  return {
    status: connectionStatus({ state, everConnected, online, subscribed }),
    realtime: true,
  };
}
