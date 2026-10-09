import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  decodeChatCursor,
  encodeChatCursor,
  type ChatCursor,
} from './chat-cursor.js';
import {
  CHAT_HISTORY_DEFAULT_LIMIT,
  type ChatHistoryQueryDto,
} from './chat.dto.js';
import type {
  ChatAttachment,
  ChatMessageStatus,
} from './entities/chat-message.entity.js';
import type { ChatMember } from './realtime/realtime-provider.js';

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

export interface ChatHistoryPage {
  /** Always oldest first, whichever direction was asked for. */
  messages: ChatMessageView[];
  /** More messages exist beyond this page in the direction asked for. */
  hasMore: boolean;
}

type Row = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarKey: string | null;
  content: string;
  attachments: ChatAttachment[];
  status: ChatMessageStatus;
  createdAt: string;
};

const invalid = (code: string) =>
  new BadRequestException({ statusCode: 400, message: code, code });

@Injectable()
export class ChatHistoryService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * One page of a course's chat, read by keyset on (created_at, id). Learners
   * never see HIDDEN messages; the course's instructors do, to moderate.
   */
  async page(
    courseId: string,
    viewer: ChatMember,
    query: ChatHistoryQueryDto,
  ): Promise<ChatHistoryPage> {
    if (query.cursor !== undefined && query.after !== undefined)
      throw invalid('CHAT_CURSOR_CONFLICT');
    const anchor = this.decode(query.cursor ?? query.after);
    const forward = query.after !== undefined;
    const limit = query.limit ?? CHAT_HISTORY_DEFAULT_LIMIT;

    const params: unknown[] = [courseId, limit + 1];
    let keyset = '';
    if (anchor) {
      params.push(anchor.createdAt, anchor.id);
      keyset = `AND (message.created_at, message.id) ${forward ? '>' : '<'}
        ($3::timestamptz, $4::uuid)`;
    }
    const order = forward ? 'ASC' : 'DESC';
    const rows = await this.dataSource.query<Row[]>(
      `SELECT message.id,
         message.sender_id AS "senderId",
         sender.display_name AS "senderName",
         sender.avatar_key AS "senderAvatarKey",
         message.content,
         message.attachments,
         message.status,
         to_char(message.created_at AT TIME ZONE 'UTC',
           'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
       FROM chat_messages message
       INNER JOIN users sender ON sender.id = message.sender_id
       WHERE message.course_id = $1
         ${viewer.role === 'student' ? `AND message.status <> 'HIDDEN'` : ''}
         ${keyset}
       ORDER BY message.created_at ${order}, message.id ${order}
       LIMIT $2`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    if (!forward) page.reverse();
    return { messages: page.map((row) => this.view(row)), hasMore };
  }

  private decode(value: string | undefined): ChatCursor | null {
    if (value === undefined) return null;
    const cursor = decodeChatCursor(value);
    if (!cursor) throw invalid('CHAT_CURSOR_INVALID');
    return cursor;
  }

  private view(row: Row): ChatMessageView {
    return {
      id: row.id,
      sender: {
        id: row.senderId,
        name: row.senderName,
        avatarUrl: row.senderAvatarKey
          ? `/avatars/${row.senderAvatarKey}`
          : null,
      },
      content: row.content,
      attachments: row.attachments,
      status: row.status,
      createdAt: row.createdAt,
      cursor: encodeChatCursor({ createdAt: row.createdAt, id: row.id }),
    };
  }
}
