import { encodeChatCursor } from './chat-cursor.js';
import type {
  ChatAttachment,
  ChatMessageStatus,
} from './entities/chat-message.entity.js';

/** A message as every chat endpoint and real-time event presents it. */
export interface ChatMessageView {
  id: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  content: string;
  attachments: ChatAttachment[];
  status: ChatMessageStatus;
  /** ISO 8601, microsecond precision. */
  createdAt: string;
  /** Pass as `cursor` (older) or `after` (newer) to page from this message. */
  cursor: string;
}

export type ChatMessageRow = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarKey: string | null;
  content: string;
  attachments: ChatAttachment[];
  status: ChatMessageStatus;
  createdAt: string;
};

/**
 * Columns of a ChatMessageRow, for `chat_messages message` joined to
 * `users sender`. created_at keeps PostgreSQL's microseconds (see ChatCursor).
 */
export const CHAT_MESSAGE_COLUMNS = `message.id,
  message.sender_id AS "senderId",
  sender.display_name AS "senderName",
  sender.avatar_key AS "senderAvatarKey",
  message.content,
  message.attachments,
  message.status,
  to_char(message.created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`;

export function chatMessageView(row: ChatMessageRow): ChatMessageView {
  return {
    id: row.id,
    sender: {
      id: row.senderId,
      name: row.senderName,
      avatarUrl: row.senderAvatarKey ? `/avatars/${row.senderAvatarKey}` : null,
    },
    content: row.content,
    attachments: row.attachments,
    status: row.status,
    createdAt: row.createdAt,
    cursor: encodeChatCursor({ createdAt: row.createdAt, id: row.id }),
  };
}
