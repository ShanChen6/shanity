import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { decodeChatCursor, type ChatCursor } from './chat-cursor.js';
import { ChatMessageStatus } from './entities/chat-message.entity.js';
import {
  CHAT_MESSAGE_COLUMNS,
  chatMessageView,
  type ChatMessageRow,
  type ChatMessageView,
} from './chat-message-view.js';
import {
  CHAT_HISTORY_DEFAULT_LIMIT,
  type ChatHistoryQueryDto,
} from './chat.dto.js';
import type { ChatMember } from './realtime/realtime-provider.js';

export type { ChatMessageView };

export interface ChatHistoryPage {
  /** Always oldest first, whichever direction was asked for. */
  messages: ChatMessageView[];
  /** More messages exist beyond this page in the direction asked for. */
  hasMore: boolean;
}

const invalid = (code: string) =>
  new BadRequestException({ statusCode: 400, message: code, code });

@Injectable()
export class ChatHistoryService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * One page of a course's chat, read by keyset on (created_at, id). Learners
   * never see HIDDEN messages nor that one is FLAGGED; the course's
   * instructors see both, to moderate.
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
    const rows = await this.dataSource.query<ChatMessageRow[]>(
      `SELECT ${CHAT_MESSAGE_COLUMNS}
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
    const messages = page.map(chatMessageView);
    // Who has been reported is moderators' business: to learners (the sender
    // included) a flagged message is just a message.
    if (viewer.role === 'student')
      for (const message of messages)
        if (message.status === ChatMessageStatus.FLAGGED)
          message.status = ChatMessageStatus.ACTIVE;
    return { messages, hasMore };
  }

  private decode(value: string | undefined): ChatCursor | null {
    if (value === undefined) return null;
    const cursor = decodeChatCursor(value);
    if (!cursor) throw invalid('CHAT_CURSOR_INVALID');
    return cursor;
  }
}
