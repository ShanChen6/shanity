import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChatAccessService } from './chat-access.service.js';
import { courseChannel } from './chat-channels.js';
import { ChatEvents } from './chat-events.js';
import {
  CHAT_MESSAGE_COLUMNS,
  chatMessageView,
  type ChatMessageRow,
  type ChatMessageView,
} from './chat-message-view.js';
import type { ChatMember } from './realtime/realtime-provider.js';
import { RealtimeProvider } from './realtime/realtime-provider.js';

/** The caller's standing in a room, for the chat UI. */
export interface ChatMe {
  courseId: string;
  role: ChatMember['role'];
  /** ISO 8601 while muted, else null. */
  mutedUntil: string | null;
}

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeProvider,
  ) {}

  async me(courseId: string, member: ChatMember): Promise<ChatMe> {
    const mutedUntil =
      member.role === 'instructor'
        ? null
        : await this.access.mutedUntil(member.id, courseId);
    return {
      courseId,
      role: member.role,
      mutedUntil: mutedUntil?.toISOString() ?? null,
    };
  }

  /**
   * Stores a message, then announces it to the room. The guards in front
   * (membership, mute, flood limit) have already let it through. Publishing
   * is best effort: the message is durable, and clients that miss the event
   * pick it up on their next catch-up.
   */
  async send(
    courseId: string,
    member: ChatMember,
    content: string,
  ): Promise<ChatMessageView> {
    const [row] = await this.dataSource.query<ChatMessageRow[]>(
      `WITH message AS (
         INSERT INTO chat_messages(course_id, sender_id, content)
         VALUES ($1, $2, $3)
         RETURNING *
       )
       SELECT ${CHAT_MESSAGE_COLUMNS}
       FROM message INNER JOIN users sender ON sender.id = message.sender_id`,
      [courseId, member.id, content],
    );
    const view = chatMessageView(row);
    if (this.realtime.isAvailable())
      await this.realtime
        .publish(courseChannel(courseId), ChatEvents.MESSAGE_CREATED, view)
        .catch((error: Error) =>
          this.logger.warn({ courseId, error: error.name }),
        );
    return view;
  }
}
