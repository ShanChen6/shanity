import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ChatAccessService } from '../chat-access.service.js';
import type { ChatRequest } from './chat-enrollment.guard.js';

/**
 * Refuses sending while the caller is muted in the room, after
 * ChatEnrollmentGuard (which resolves the course). Checked against the
 * database on every send, so a mute bites on the very next message and
 * lapses by itself at `mutedUntil`. A course's teachers are never muted.
 */
@Injectable()
export class ChatMuteGuard implements CanActivate {
  constructor(private readonly access: ChatAccessService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ChatRequest>();
    if (request.chatMember.role === 'instructor') return true;
    const mutedUntil = await this.access.mutedUntil(
      request.principal.id,
      request.chatCourseId,
    );
    if (!mutedUntil) return true;
    throw new ForbiddenException({
      statusCode: 403,
      message: 'CHAT_MUTED',
      code: 'CHAT_MUTED',
      mutedUntil: mutedUntil.toISOString(),
    });
  }
}
