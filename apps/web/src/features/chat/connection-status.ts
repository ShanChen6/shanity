/** What the badge shows: green, amber (first connect or reconnecting), red. */
export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected";

/**
 * Pusher's connection states (initialized, connecting, connected,
 * unavailable, failed, disconnected) as the room's status. "Connecting"
 * after a first successful connection is a reconnect.
 */
export function connectionStatus({
  state,
  everConnected,
  online,
  subscribed,
}: {
  state: string;
  everConnected: boolean;
  online: boolean;
  /** The room's channel was authorized; false while pending or refused. */
  subscribed: boolean;
}): ConnectionStatus {
  if (!online) return "disconnected";
  if (state === "connected")
    return subscribed ? "connected" : everConnected ? "reconnecting" : "connecting";
  if (state === "initialized" || state === "connecting")
    return everConnected ? "reconnecting" : "connecting";
  return "disconnected";
}

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: "Đã kết nối",
  connecting: "Đang kết nối...",
  reconnecting: "Đang kết nối lại...",
  disconnected: "Mất kết nối",
};
