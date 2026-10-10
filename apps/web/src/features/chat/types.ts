export type ChatMessageStatus = "ACTIVE" | "HIDDEN" | "FLAGGED";

export type ChatAttachment = {
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

/** A message as GET /api/v1/courses/:courseId/chat/messages returns it. */
export type ChatMessage = {
  id: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  content: string;
  attachments: ChatAttachment[];
  status: ChatMessageStatus;
  /** ISO 8601 with microseconds: fixed width, so it sorts as a string. */
  createdAt: string;
  /** Opaque keyset position; hand back as `cursor` (older) or `after` (newer). */
  cursor: string;
};

export type ChatHistoryPage = {
  /** Oldest first, whichever direction was asked for. */
  messages: ChatMessage[];
  /** More messages exist beyond this page in the direction asked for. */
  hasMore: boolean;
};

/** What the client holds for one room, in memory and in localStorage. */
export type ChatRoomState = {
  /** Oldest first, unique by id. */
  messages: ChatMessage[];
  /** The server has messages older than the oldest held here. */
  hasOlder: boolean;
};
